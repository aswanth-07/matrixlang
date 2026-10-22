// ExactReduce.cpp -- an LLVM pass that licenses the reassociation of a
// floating-point reduction exactly when every order of its additions returns
// the same bits.
//
// This is the per-reduction license of the MatrixLang paper (the free-reduction
// corollary of the correctly-rounded-chain theorem) moved from MatrixLang's
// declared input domains to facts LLVM already has: the integer ranges of
// values converted to floating point. A value is described by a grid fact
// (G, K): it is an integer multiple of 2^G whose magnitude is at most K * 2^G.
// Integers converted by sitofp/uitofp have G = 0 (or the number of their known
// trailing zero bits) and K from their constant range; products add grids and
// multiply bounds; sums take the finer grid and add bounds. An operation whose
// fact satisfies K <= 2^p (p = 53 for double, 24 for float) and whose grid lies
// within the format's exponent range is exact (Lemma 1 of the paper).
//
// For a reduction s = s0 + t_1 + ... + t_N, every partial sum of every
// association is bounded by |s0| + N * max|t| and lies on the finer of the
// grids of s0 and the terms. When that bound is at most 2^(p+G), every partial
// sum is exact, so every order returns the exact sum; and an addition returns
// -0 only if both addends are -0 (Lemma 2 of the paper), so a zero result has
// the same sign in every order. The pass then sets `reassoc` on exactly the
// reduction's chain operations, which is its only change to them: the loop
// vectorizer reads the flag and vectorizes, interleaves and reorders the
// reduction, and the result keeps the strict program's bits. `nsz` is never
// set, so the vectorizer's identity for partial sums stays -0.0, which never
// changes a sum.
//
// The bound is proved statically when the start value is a constant (or the
// running sum of an enclosing loop that starts at one) and SCEV bounds the
// trip count. Otherwise, when the loop can be versioned, a guard in the
// preheader checks the actual start value and trip count -- s0 is a multiple
// of 2^G, and |s0| / 2^G + trip count * K <= 2^p, in integer arithmetic -- and
// runs a licensed copy of the loop when it holds and the untouched loop when it
// does not. The guard costs a handful of instructions per loop entry.
//
// Reports go to the file named by EXACT_REDUCE_REPORT (or stderr when it is
// "-"), one line per floating-point add reduction:
//     <function> <loop> <file:line> licensed|versioned|declined <reason>
//
// Two switches exist only for the validation study, which must show that the
// checks are necessary: EXACT_REDUCE_EXTRA_BITS=<k> widens every significand
// by k bits (k = 1 is a mutant that accepts one bit too many), and
// EXACT_REDUCE_FORCE=1 licenses every add reduction without a proof, which is
// what -fassociative-math does to such a loop. EXACT_REDUCE_VERSION=0
// disables versioning.
//
// Build: make -C llvm.  Use: clang -O2 -fpass-plugin=llvm/ExactReduce.so ...

#include "llvm/ADT/APInt.h"
#include "llvm/ADT/DenseMap.h"
#include "llvm/ADT/SmallPtrSet.h"
#include "llvm/ADT/SmallVector.h"
#include "llvm/ADT/StringExtras.h"
#include "llvm/Analysis/AssumptionCache.h"
#include "llvm/Analysis/IVDescriptors.h"
#include "llvm/Analysis/LoopInfo.h"
#include "llvm/Analysis/ScalarEvolution.h"
#include "llvm/Analysis/ScalarEvolutionExpressions.h"
#include "llvm/Analysis/ValueTracking.h"
#include "llvm/IR/Constants.h"
#include "llvm/IR/DebugInfoMetadata.h"
#include "llvm/IR/Dominators.h"
#include "llvm/IR/IRBuilder.h"
#include "llvm/IR/Instructions.h"
#include "llvm/IR/IntrinsicInst.h"
#include "llvm/IR/PassManager.h"
#include "llvm/Passes/PassBuilder.h"
#include "llvm/Passes/PassPlugin.h"
#include "llvm/Support/FileSystem.h"
#include "llvm/Support/KnownBits.h"
#include "llvm/Support/Path.h"
#include "llvm/Support/raw_ostream.h"
#include "llvm/Transforms/Utils/BasicBlockUtils.h"
#include "llvm/Transforms/Utils/Cloning.h"
#include "llvm/Transforms/Utils/LoopSimplify.h"
#include "llvm/Transforms/Utils/LoopUtils.h"
#include "llvm/Transforms/Utils/ScalarEvolutionExpander.h"
#include "llvm/Transforms/Utils/ValueMapper.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <optional>
#include <string>

using namespace llvm;

namespace {

constexpr unsigned Width = 320;   // bits for bounds; anything wider is unknown

// ---- options, read once from the environment ---------------------------------

struct Options {
  int ExtraBits = 0;      // EXACT_REDUCE_EXTRA_BITS: added to p (validation only)
  bool Force = false;     // EXACT_REDUCE_FORCE: license every add reduction
  bool Version = true;    // EXACT_REDUCE_VERSION=0 disables loop versioning
  std::string Report;     // EXACT_REDUCE_REPORT: a path, or "-" for stderr

  static const Options &get() {
    static Options O = [] {
      Options R;
      if (const char *B = std::getenv("EXACT_REDUCE_EXTRA_BITS")) R.ExtraBits = std::atoi(B);
      if (const char *F = std::getenv("EXACT_REDUCE_FORCE")) R.Force = std::atoi(F) != 0;
      if (const char *V = std::getenv("EXACT_REDUCE_VERSION")) R.Version = std::atoi(V) != 0;
      if (const char *P = std::getenv("EXACT_REDUCE_REPORT")) R.Report = P;
      return R;
    }();
    return O;
  }
};

void report(const std::string &Line) {
  const Options &O = Options::get();
  if (O.Report.empty())
    return;
  if (O.Report == "-") {
    errs() << Line << "\n";
    return;
  }
  std::error_code EC;
  raw_fd_ostream Out(O.Report, EC, sys::fs::OF_Append | sys::fs::OF_Text);
  if (!EC)
    Out << Line << "\n";
}

// ---- the grid fact -------------------------------------------------------------

struct Fact {
  bool Known = false;
  int G = 0;              // every value is an integer multiple of 2^G
  APInt K{Width, 0};      // and has magnitude at most K * 2^G

  static Fact unknown() { return Fact(); }
  static Fact make(int G, const APInt &K) {
    Fact F;
    F.Known = true;
    F.G = G;
    F.K = K.zextOrTrunc(Width);
    return F;
  }
  static Fact zero() { return make(0, APInt(Width, 0)); }
  bool isZero() const { return Known && K.isZero(); }
};

// Significand width and exponent range of a floating-point type.
struct Format {
  int P = 0;        // significand bits, hidden bit included
  int EMin = 0;     // exponent of the smallest subnormal
  int EMax = 0;     // largest G + P whose power of two is finite
  bool ok() const { return P > 0; }
};

Format formatOf(Type *T) {
  Format F;
  if (T->isDoubleTy()) { F.P = 53; F.EMin = -1074; F.EMax = 1023; }
  else if (T->isFloatTy()) { F.P = 24; F.EMin = -149; F.EMax = 127; }
  if (F.ok())
    F.P += Options::get().ExtraBits;
  return F;
}

// K << S, or nothing when it does not fit in Width bits.
std::optional<APInt> shiftUp(const APInt &K, long S) {
  if (K.isZero())
    return K;
  if (S < 0 || S >= long(Width) || long(K.countl_zero()) < S)
    return std::nullopt;
  return K.shl(unsigned(S));
}

// Both facts on the finer grid.
bool align(const Fact &A, const Fact &B, int &G, APInt &KA, APInt &KB) {
  if (A.isZero()) { G = B.G; KA = APInt(Width, 0); KB = B.K; return true; }
  if (B.isZero()) { G = A.G; KA = A.K; KB = APInt(Width, 0); return true; }
  G = std::min(A.G, B.G);
  auto SA = shiftUp(A.K, long(A.G) - G), SB = shiftUp(B.K, long(B.G) - G);
  if (!SA || !SB)
    return false;
  KA = *SA;
  KB = *SB;
  return true;
}

Fact addFacts(const Fact &A, const Fact &B) {
  if (!A.Known || !B.Known)
    return Fact::unknown();
  int G;
  APInt KA(Width, 0), KB(Width, 0);
  if (!align(A, B, G, KA, KB))
    return Fact::unknown();
  bool Ov = false;
  APInt K = KA.uadd_ov(KB, Ov);
  return Ov ? Fact::unknown() : Fact::make(G, K);
}

Fact joinFacts(const Fact &A, const Fact &B) {
  if (!A.Known || !B.Known)
    return Fact::unknown();
  int G;
  APInt KA(Width, 0), KB(Width, 0);
  if (!align(A, B, G, KA, KB))
    return Fact::unknown();
  return Fact::make(G, KA.ugt(KB) ? KA : KB);
}

Fact mulFacts(const Fact &A, const Fact &B) {
  if (!A.Known || !B.Known)
    return Fact::unknown();
  if (A.isZero() || B.isZero())
    return Fact::zero();
  bool Ov = false;
  APInt K = A.K.umul_ov(B.K, Ov);
  long G = long(A.G) + long(B.G);
  if (Ov || G < -100000 || G > 100000)
    return Fact::unknown();
  return Fact::make(int(G), K);
}

Fact scaleFact(const Fact &A, const APInt &N) {
  if (!A.Known)
    return Fact::unknown();
  bool Ov = false;
  APInt K = A.K.umul_ov(N.zextOrTrunc(Width), Ov);
  return Ov ? Fact::unknown() : Fact::make(A.G, K);
}

// Every multiple of 2^G of magnitude at most K * 2^G is representable.
bool exactIn(const Fact &F, const Format &Fm) {
  if (!F.Known || !Fm.ok())
    return false;
  if (F.isZero())
    return true;
  APInt Limit = APInt::getOneBitSet(Width, unsigned(Fm.P));
  return F.K.ule(Limit) && F.G >= Fm.EMin && F.G + Fm.P <= Fm.EMax;
}

std::string describe(const Fact &F) {
  if (!F.Known)
    return "unknown";
  if (F.isZero())
    return "0";
  char Buf[64];
  std::snprintf(Buf, sizeof Buf, "2^%.2f", std::log2(F.K.roundToDouble()) + F.G);
  return Buf;
}

// ---- facts of values -------------------------------------------------------------

class FactAnalysis {
public:
  FactAnalysis(AssumptionCache &AC, DominatorTree &DT, ScalarEvolution &SE, Loop *L)
      : AC(AC), DT(DT), SE(SE), L(L) {}

  Fact of(Value *V) {
    auto It = Cache.find(V);
    if (It != Cache.end())
      return It->second;
    if (!Busy.insert(V).second)
      return Fact::unknown();   // a cycle that is not the reduction: give up
    Fact F = compute(V);
    Busy.erase(V);
    Cache[V] = F;
    return F;
  }

private:
  AssumptionCache &AC;
  DominatorTree &DT;
  ScalarEvolution &SE;
  Loop *L;
  DenseMap<Value *, Fact> Cache;
  SmallPtrSet<Value *, 16> Busy;

  static Fact exactOrUnknown(const Fact &F, Type *T) {
    return exactIn(F, formatOf(T)) ? F : Fact::unknown();
  }

  // The range of an integer from value tracking, narrowed by SCEV (which knows
  // induction variables and the loop's guards).
  ConstantRange rangeOf(Value *IntV, bool Signed, Instruction *Ctx) {
    ConstantRange CR = computeConstantRange(IntV, Signed, /*UseInstrInfo=*/true, &AC, Ctx, &DT);
    if (SE.isSCEVable(IntV->getType())) {
      const SCEV *S = SE.applyLoopGuards(SE.getSCEV(IntV), L);
      ConstantRange R = Signed ? SE.getSignedRange(S) : SE.getUnsignedRange(S);
      if (R.getBitWidth() == CR.getBitWidth())
        CR = CR.intersectWith(R, Signed ? ConstantRange::Signed : ConstantRange::Unsigned);
    }
    return CR;
  }

  Fact fromInteger(Value *IntV, bool Signed, Instruction *Ctx, Type *DestTy) {
    unsigned Bits = IntV->getType()->getScalarSizeInBits();
    ConstantRange CR = rangeOf(IntV, Signed, Ctx);
    if (CR.isEmptySet())
      return Fact::zero();
    APInt Mag;
    if (Signed) {
      // |INT_MIN| does not fit in Bits bits: take magnitudes one bit wider.
      APInt ALo = CR.getSignedMin().sext(Bits + 1).abs();
      APInt AHi = CR.getSignedMax().sext(Bits + 1).abs();
      Mag = ALo.ugt(AHi) ? ALo : AHi;
    } else {
      Mag = CR.getUnsignedMax().zext(Bits + 1);
    }
    // Known trailing zero bits raise the grid: every value is a multiple of 2^T.
    KnownBits KB = computeKnownBits(IntV, Ctx->getModule()->getDataLayout(), 0, &AC, Ctx, &DT);
    unsigned T = std::min(KB.countMinTrailingZeros(), Bits);
    APInt K = Mag.zextOrTrunc(Width).lshr(T);
    // The conversion itself must be exact.
    return exactOrUnknown(Fact::make(int(T), K), DestTy);
  }

  static Fact fromConstant(const APFloat &C, Type *T) {
    if (!C.isFinite())
      return Fact::unknown();
    if (C.isZero())
      return Fact::zero();
    bool LosesInfo = false;
    APFloat D = C;
    D.convert(APFloat::IEEEdouble(), APFloat::rmNearestTiesToEven, &LosesInfo);
    if (LosesInfo)
      return Fact::unknown();
    int E = 0;
    double M = std::frexp(std::fabs(D.convertToDouble()), &E);   // M in [0.5, 1)
    uint64_t Mant = uint64_t(std::ldexp(M, 53));                 // exact
    int G = E - 53;
    while (Mant && !(Mant & 1)) { Mant >>= 1; ++G; }
    return exactOrUnknown(Fact::make(G, APInt(Width, Mant)), T);
  }

  Fact compute(Value *V) {
    Type *T = V->getType();
    if (auto *CF = dyn_cast<ConstantFP>(V))
      return fromConstant(CF->getValueAPF(), T);
    auto *I = dyn_cast<Instruction>(V);
    if (!I)
      return Fact::unknown();
    switch (I->getOpcode()) {
    case Instruction::SIToFP:
      return fromInteger(I->getOperand(0), /*Signed=*/true, I, T);
    case Instruction::UIToFP:
      return fromInteger(I->getOperand(0), /*Signed=*/false, I, T);
    case Instruction::FPExt:
      return of(I->getOperand(0));
    case Instruction::FPTrunc:
      return exactOrUnknown(of(I->getOperand(0)), T);
    case Instruction::FNeg:
      return of(I->getOperand(0));
    case Instruction::FMul:
      return exactOrUnknown(mulFacts(of(I->getOperand(0)), of(I->getOperand(1))), T);
    case Instruction::FAdd:
    case Instruction::FSub:
      return exactOrUnknown(addFacts(of(I->getOperand(0)), of(I->getOperand(1))), T);
    case Instruction::Select:
      return joinFacts(of(I->getOperand(1)), of(I->getOperand(2)));
    case Instruction::PHI: {
      Fact F;
      bool First = true;
      for (Value *In : cast<PHINode>(I)->incoming_values()) {
        Fact X = of(In);
        F = First ? X : joinFacts(F, X);
        First = false;
        if (!F.Known)
          break;
      }
      return F;
    }
    case Instruction::Call: {
      auto *II = dyn_cast<IntrinsicInst>(I);
      if (!II)
        return Fact::unknown();
      switch (II->getIntrinsicID()) {
      case Intrinsic::fabs:
        return of(II->getArgOperand(0));
      case Intrinsic::fmuladd:
      case Intrinsic::fma: {
        Fact P = exactOrUnknown(mulFacts(of(II->getArgOperand(0)), of(II->getArgOperand(1))), T);
        return exactOrUnknown(addFacts(P, of(II->getArgOperand(2))), T);
      }
      default:
        return Fact::unknown();
      }
    }
    default:
      return Fact::unknown();
    }
  }
};

// ---- reductions --------------------------------------------------------------------

std::string where(Instruction *I) {
  if (const DebugLoc &DL = I->getDebugLoc())
    return (sys::path::filename(DL->getFilename()) + ":" + Twine(DL.getLine())).str();
  return "?";
}

// The reduction from the latch value back to the phi: its chain operations and
// the worst-case magnitude one iteration adds.
struct Chain {
  SmallVector<Instruction *, 8> Ops;
  Fact PerIteration;
  std::string Why;
};

class ChainWalker {
public:
  ChainWalker(PHINode *Phi, Loop *L, FactAnalysis &FA) : Phi(Phi), L(L), FA(FA) {}

  bool run(Chain &C) {
    Fact W = walk(Phi->getIncomingValueForBlock(L->getLoopLatch()), C);
    if (!W.Known) {
      if (C.Why.empty())
        C.Why = "a term has no grid fact";
      return false;
    }
    C.PerIteration = W;
    return true;
  }

private:
  PHINode *Phi;
  Loop *L;
  FactAnalysis &FA;
  DenseMap<Value *, Fact> Memo;
  DenseMap<Value *, bool> Reaches;

  bool reaches(Value *V) {
    if (V == Phi)
      return true;
    auto It = Reaches.find(V);
    if (It != Reaches.end())
      return It->second;
    Reaches[V] = false;   // breaks cycles
    bool R = false;
    if (auto *I = dyn_cast<Instruction>(V))
      if (L->contains(I) && I->getType() == Phi->getType() &&
          (isa<BinaryOperator>(I) || isa<SelectInst>(I) || isa<PHINode>(I) ||
           isa<IntrinsicInst>(I)))
        for (Value *Op : I->operands())
          if (reaches(Op)) {
            R = true;
            break;
          }
    Reaches[V] = R;
    return R;
  }

  void note(Chain &C, Instruction *I) {
    if (std::find(C.Ops.begin(), C.Ops.end(), I) == C.Ops.end())
      C.Ops.push_back(I);
  }

  // The magnitude added between the phi and V along the worst path.
  Fact walk(Value *V, Chain &C) {
    if (V == Phi)
      return Fact::zero();
    auto It = Memo.find(V);
    if (It != Memo.end())
      return It->second;
    Memo[V] = Fact::unknown();
    Fact R = step(V, C);
    Memo[V] = R;
    return R;
  }

  Fact fail(Chain &C, const std::string &Why) {
    if (C.Why.empty())
      C.Why = Why;
    return Fact::unknown();
  }

  Fact step(Value *V, Chain &C) {
    auto *I = dyn_cast<Instruction>(V);
    if (!I || !L->contains(I))
      return fail(C, "the chain leaves the loop");
    if (I->getOpcode() == Instruction::FAdd || I->getOpcode() == Instruction::FSub) {
      Value *A = I->getOperand(0), *B = I->getOperand(1);
      bool RA = reaches(A), RB = reaches(B);
      if (RA == RB)
        return fail(C, "not a linear sum");
      if (I->getOpcode() == Instruction::FSub && RB)
        return fail(C, "the accumulator is subtracted");
      Value *Acc = RA ? A : B, *Term = RA ? B : A;
      note(C, I);
      Fact TF = FA.of(Term);
      if (!TF.Known)
        return fail(C, "a term has no grid fact");
      return addFacts(walk(Acc, C), TF);
    }
    if (auto *II = dyn_cast<IntrinsicInst>(I)) {
      if (II->getIntrinsicID() != Intrinsic::fmuladd)
        return fail(C, "an intrinsic in the chain");
      Value *X = II->getArgOperand(0), *Y = II->getArgOperand(1), *Acc = II->getArgOperand(2);
      if (reaches(X) || reaches(Y) || !reaches(Acc))
        return fail(C, "not a linear sum");
      Fact FX = FA.of(X), FY = FA.of(Y);
      if (!FX.Known || !FY.Known)
        return fail(C, "a term has no grid fact");
      Fact P = mulFacts(FX, FY);
      if (!exactIn(P, formatOf(II->getType())))
        return fail(C, "a product is not exact");
      note(C, II);
      return addFacts(walk(Acc, C), P);
    }
    if (auto *S = dyn_cast<SelectInst>(I)) {
      // A conditional reduction: the worse of the two arms.
      if (!reaches(S->getTrueValue()) || !reaches(S->getFalseValue()))
        return fail(C, "a select that replaces the accumulator");
      return joinFacts(walk(S->getTrueValue(), C), walk(S->getFalseValue(), C));
    }
    if (auto *P = dyn_cast<PHINode>(I)) {
      Fact F;
      bool First = true;
      for (Value *In : P->incoming_values()) {
        if (!reaches(In))
          return fail(C, "a phi that replaces the accumulator");
        Fact X = walk(In, C);
        F = First ? X : joinFacts(F, X);
        First = false;
      }
      return F;
    }
    return fail(C, std::string("an unsupported operation in the chain: ") + I->getOpcodeName());
  }
};

// The largest number of iterations of one entry into L, if SCEV bounds it.
std::optional<APInt> maxTripCount(Loop *L, ScalarEvolution &SE) {
  std::optional<APInt> Best;
  if (auto *C = dyn_cast<SCEVConstant>(SE.getConstantMaxBackedgeTakenCount(L)))
    Best = C->getAPInt().zext(Width);
  const SCEV *S = SE.getSymbolicMaxBackedgeTakenCount(L);
  if (!isa<SCEVCouldNotCompute>(S)) {
    APInt M = SE.getUnsignedRangeMax(SE.applyLoopGuards(S, L)).zext(Width);
    if (!Best || M.ult(*Best))
      Best = M;
  }
  if (!Best)
    return std::nullopt;
  return *Best + 1;
}

// The start value of a reduction, statically: a value with a grid fact, or
// the running sum of enclosing loops whose only change per iteration is this
// loop's result. Repeat is how many entries into L add to that running sum.
struct StartFact {
  Fact Before;
  APInt Repeat{Width, 1};
};

StartFact startFact(Value *Start, PHINode *Phi, Loop *L, ScalarEvolution &SE, FactAnalysis &FA) {
  StartFact S;
  Value *Cur = Start;
  for (int Depth = 0; Depth < 4; ++Depth) {
    Fact F = FA.of(Cur);
    if (F.Known) {
      S.Before = F;
      return S;
    }
    auto *P = dyn_cast<PHINode>(Cur);
    Loop *Parent = L->getParentLoop();
    if (!P || !Parent || P->getParent() != Parent->getHeader() || !Parent->getLoopLatch() ||
        !Parent->getLoopPreheader())
      return S;
    // The parent's latch value must be this loop's result, through LCSSA phis.
    Value *Back = P->getIncomingValueForBlock(Parent->getLoopLatch());
    while (auto *LP = dyn_cast<PHINode>(Back)) {
      if (LP == P || LP->getNumIncomingValues() != 1)
        break;
      Back = LP->getIncomingValue(0);
    }
    if (Back != Phi->getIncomingValueForBlock(L->getLoopLatch()))
      return S;
    auto TC = maxTripCount(Parent, SE);
    if (!TC)
      return S;
    bool Ov = false;
    S.Repeat = S.Repeat.umul_ov(*TC, Ov);
    if (Ov)
      return S;
    Cur = P->getIncomingValueForBlock(Parent->getLoopPreheader());
    Phi = P;
    L = Parent;
  }
  return S;
}

struct Decision {
  enum Kind { Declined, Licensed, Versioned } What = Declined;
  std::string Why;
  int G = 0;              // the guard's grid (never above 0)
  APInt K{Width, 0};      // one iteration's terms, in units of 2^G
};

// ---- loop versioning ------------------------------------------------------------------

// An upper bound on BTC that is safe to compute in the preheader: BTC itself,
// or with a division by a loop-invariant value replaced by its dividend (a
// quotient by a nonzero divisor is at most the dividend), through the
// monotone zero extension. Null when there is none.
const SCEV *expandableBound(const SCEV *BTC, ScalarEvolution &SE, Instruction *At) {
  SCEVExpander Exp(SE, At->getModule()->getDataLayout(), "exact.reduce");
  for (int Depth = 0; Depth < 4 && BTC; ++Depth) {
    if (Exp.isSafeToExpandAt(BTC, At))
      return BTC;
    if (auto *D = dyn_cast<SCEVUDivExpr>(BTC))
      BTC = D->getLHS();
    else if (auto *Z = dyn_cast<SCEVZeroExtendExpr>(BTC)) {
      const SCEV *Inner = expandableBound(Z->getOperand(), SE, At);
      return Inner ? SE.getZeroExtendExpr(Inner, Z->getType()) : nullptr;
    } else
      return nullptr;
  }
  return nullptr;
}

// Why L does not have the shape versionLoop handles -- innermost, one exit
// reached from one exiting block, and a trip count SCEV can compute and
// expand on entry -- or the empty string when it does.
std::string cannotVersion(Loop *L, ScalarEvolution &SE) {
  BasicBlock *Preheader = L->getLoopPreheader();
  BasicBlock *Exit = L->getExitBlock();
  BasicBlock *Exiting = L->getExitingBlock();
  if (!L->isInnermost())
    return "it is not innermost";
  if (!Preheader || !Exit || !Exiting || !L->isLoopSimplifyForm())
    return "it has more than one exit";
  if (Exit->getUniquePredecessor() != Exiting)
    return "its exit is shared";
  const SCEV *BTC = SE.getBackedgeTakenCount(L);
  if (isa<SCEVCouldNotCompute>(BTC))
    return "its trip count is not computable on entry";
  if (!BTC->getType()->isIntegerTy() || BTC->getType()->getIntegerBitWidth() > 64)
    return "its trip count is wider than 64 bits";
  if (!expandableBound(BTC, SE, Preheader->getTerminator()))
    return "its trip count cannot be computed safely in the preheader";
  return "";
}

// The guard: s0 is a multiple of 2^G and |s0| / 2^G + (BTC + 1) * K <= 2^P.
Value *buildGuard(IRBuilder<> &B, Value *Start, Value *BTC, const Decision &D) {
  Type *FT = Start->getType();
  Type *I64 = B.getInt64Ty();
  Format Fm = formatOf(FT);
  Value *A = B.CreateUnaryIntrinsic(Intrinsic::fabs, Start);
  Value *InRange = B.CreateFCmpOLE(A, ConstantFP::get(FT, std::ldexp(1.0, Fm.P + D.G)));
  // With G <= 0, scaling by 2^-G is exact once |s0| <= 2^(P+G): it cannot overflow.
  Value *U = B.CreateFMul(A, ConstantFP::get(FT, std::ldexp(1.0, -D.G)));
  Value *Whole = B.CreateFCmpOEQ(U, B.CreateUnaryIntrinsic(Intrinsic::trunc, U));
  Value *Valid = B.CreateAnd(InRange, Whole);
  Value *Units = B.CreateFPToUI(B.CreateSelect(Valid, U, ConstantFP::get(FT, 0.0)), I64);
  Value *Room = B.CreateSub(ConstantInt::get(I64, uint64_t(1) << Fm.P), Units);
  Value *Lim = B.CreateUDiv(Room, ConstantInt::get(I64, D.K.getZExtValue()));
  Value *Count = B.CreateZExtOrTrunc(BTC, I64);
  Value *Fits = B.CreateICmpULT(Count, Lim);
  return B.CreateAnd(Valid, Fits, "exact.reduce.ok");
}

// Clones L. The clone runs when every reduction's guard holds and is returned
// through VMap (original -> clone); the original runs otherwise, untouched.
void versionLoop(Loop *L, ArrayRef<std::pair<Value *, Decision>> Guards, LoopInfo &LI,
                 DominatorTree &DT, ScalarEvolution &SE, ValueToValueMapTy &VMap) {
  formLCSSA(*L, DT, &LI, &SE);
  BasicBlock *Preheader = L->getLoopPreheader();
  BasicBlock *Exit = L->getExitBlock();
  BasicBlock *Exiting = L->getExitingBlock();
  const SCEV *BTC = expandableBound(SE.getBackedgeTakenCount(L), SE, Preheader->getTerminator());

  SCEVExpander Exp(SE, Preheader->getModule()->getDataLayout(), "exact.reduce");
  Value *Count = Exp.expandCodeFor(BTC, BTC->getType(), Preheader->getTerminator());
  IRBuilder<> B(Preheader->getTerminator());
  Value *Ok = B.getTrue();
  for (auto &[Start, D] : Guards)
    Ok = B.CreateAnd(Ok, buildGuard(B, Start, Count, D));

  // The old preheader becomes the check; each copy gets its own preheader.
  BasicBlock *Check = Preheader;
  BasicBlock *StrictPH = SplitBlock(Check, Check->getTerminator(), &DT, &LI, nullptr,
                                    Preheader->getName() + ".strict");
  SmallVector<BasicBlock *, 8> NewBlocks;
  cloneLoopWithPreheader(StrictPH, Check, L, VMap, ".licensed", &LI, &DT, NewBlocks);
  VMap[Exit] = Exit;
  remapInstructionsInBlocks(NewBlocks, VMap);

  BasicBlock *LicensedPH = cast<BasicBlock>(VMap[StrictPH]);
  Instruction *OldTerm = Check->getTerminator();
  BranchInst::Create(LicensedPH, StrictPH, Ok, OldTerm);
  OldTerm->eraseFromParent();

  // The exit now has two predecessors: every LCSSA phi takes the clone's value.
  BasicBlock *CloneExiting = cast<BasicBlock>(VMap[Exiting]);
  for (PHINode &P : Exit->phis()) {
    Value *In = P.getIncomingValueForBlock(Exiting);
    Value *Mapped = In;
    auto It = VMap.find(In);
    if (It != VMap.end() && It->second)
      Mapped = It->second;
    P.addIncoming(Mapped, CloneExiting);
  }
  DT.changeImmediateDominator(Exit, Check);
  SE.forgetLoop(L);
}

// Every add of the chain, found without facts (for EXACT_REDUCE_FORCE): the
// adds reachable backwards from the latch value that themselves reach the phi.
SmallVector<Instruction *, 8> chainOps(PHINode *Phi, Loop *L) {
  SmallVector<Instruction *, 8> Ops, Work;
  SmallPtrSet<Instruction *, 16> Seen;
  auto ReachesPhi = [&](Instruction *I) {
    SmallVector<Value *, 8> Stack(I->op_begin(), I->op_end());
    SmallPtrSet<Value *, 16> Visited;
    while (!Stack.empty()) {
      Value *V = Stack.pop_back_val();
      if (V == Phi)
        return true;
      auto *J = dyn_cast<Instruction>(V);
      if (!J || !L->contains(J) || J->getType() != Phi->getType() || !Visited.insert(J).second)
        continue;
      Stack.append(J->op_begin(), J->op_end());
    }
    return false;
  };
  if (auto *First = dyn_cast<Instruction>(Phi->getIncomingValueForBlock(L->getLoopLatch())))
    Work.push_back(First);
  while (!Work.empty()) {
    Instruction *I = Work.pop_back_val();
    if (!L->contains(I) || I->getType() != Phi->getType() || !Seen.insert(I).second)
      continue;
    bool IsAdd = I->getOpcode() == Instruction::FAdd || I->getOpcode() == Instruction::FSub;
    auto *II = dyn_cast<IntrinsicInst>(I);
    bool IsFMA = II && II->getIntrinsicID() == Intrinsic::fmuladd;
    if ((IsAdd || IsFMA) && ReachesPhi(I))
      Ops.push_back(I);
    if (IsAdd || IsFMA || isa<SelectInst>(I) || isa<PHINode>(I))
      for (Value *Op : I->operands())
        if (auto *J = dyn_cast<Instruction>(Op))
          Work.push_back(J);
  }
  return Ops;
}

std::string locate(PHINode *Phi, Loop *L, const SmallVectorImpl<Instruction *> &Ops) {
  for (Instruction *I : Ops)
    if (I->getDebugLoc())
      return where(I);
  if (auto *I = dyn_cast<Instruction>(Phi->getIncomingValueForBlock(L->getLoopLatch())))
    return where(I);
  return "?";
}

std::string pow2(int E) { return "2^" + std::to_string(E); }

// ---- the decision ---------------------------------------------------------------------

Decision decide(PHINode *Phi, Loop *L, const RecurrenceDescriptor &RD, const Chain &C,
                ScalarEvolution &SE, FactAnalysis &FA) {
  Decision D;
  Format Fm = formatOf(Phi->getType());
  const Fact &Per = C.PerIteration;
  std::string Terms = "terms per iteration " + describe(Per);
  if (Per.isZero()) {
    D.What = Decision::Licensed;
    D.Why = "every term is zero";
    return D;
  }

  // A static proof, when the start value and the trip count are bounded.
  StartFact S = startFact(RD.getRecurrenceStartValue(), Phi, L, SE, FA);
  auto TC = maxTripCount(L, SE);
  if (S.Before.Known && TC) {
    bool Ov = false;
    APInt N = TC->umul_ov(S.Repeat, Ov);
    if (!Ov) {
      Fact Total = addFacts(S.Before, scaleFact(Per, N));
      if (exactIn(Total, Fm)) {
        D.What = Decision::Licensed;
        D.Why = Terms + ", at most " + toString(N, 10, false) + " terms, partial sums " +
                describe(Total) + " <= " + pow2(Fm.P + Total.G);
        return D;
      }
    }
  }

  // Otherwise a guard: the grid of the check is the terms' grid, never above 1.
  D.G = std::min(Per.G, 0);
  auto K = shiftUp(Per.K, long(Per.G) - D.G);
  APInt Limit = APInt::getOneBitSet(Width, unsigned(Fm.P));
  if (!K || K->ugt(Limit) || D.G < Fm.EMin || -D.G >= Fm.EMax - Fm.P) {
    D.Why = Terms + ", not even one iteration is exact";
    return D;
  }
  D.K = *K;
  // A constant trip count that no start value admits needs no guard.
  if (unsigned Exact = SE.getSmallConstantTripCount(L)) {
    bool Ov = false;
    APInt Need = D.K.umul_ov(APInt(Width, Exact), Ov);
    if (Ov || Need.ugt(Limit)) {
      D.Why = Terms + ", " + std::to_string(Exact) + " iterations exceed the admissible " +
              toString(Limit.udiv(D.K), 10, false);
      return D;
    }
  }
  std::string Static = TC ? "trip count up to " + toString(*TC, 10, false) : "unbounded trip count";
  if (!S.Before.Known)
    Static += ", start value without a static bound";
  std::string Shape = cannotVersion(L, SE);
  if (!Shape.empty()) {
    D.Why = Terms + ", " + Static + ", and the loop cannot be versioned: " + Shape;
    return D;
  }
  D.What = Decision::Versioned;
  D.Why = Terms + ", " + Static + "; guarded by start a multiple of " + pow2(D.G) +
          " and |start| + trip count * " + describe(Fact::make(D.G, D.K)) + " <= " +
          pow2(Fm.P + D.G);
  return D;
}

// ---- the pass -----------------------------------------------------------------------

struct ExactReducePass : PassInfoMixin<ExactReducePass> {
  struct Plan {
    Loop *L;
    Value *Start;
    SmallVector<Instruction *, 8> Ops;
    Decision D;
  };

  static void license(const SmallVectorImpl<Instruction *> &Ops) {
    for (Instruction *I : Ops) {
      FastMathFlags F = I->getFastMathFlags();
      F.setAllowReassoc(true);
      I->setFastMathFlags(F);
    }
  }

  PreservedAnalyses run(Function &Fn, FunctionAnalysisManager &FAM) {
    auto &LI = FAM.getResult<LoopAnalysis>(Fn);
    auto &SE = FAM.getResult<ScalarEvolutionAnalysis>(Fn);
    auto &DT = FAM.getResult<DominatorTreeAnalysis>(Fn);
    auto &AC = FAM.getResult<AssumptionAnalysis>(Fn);
    const Options &O = Options::get();

    // Loop-simplify form (preheaders, dedicated exits) is what the vectorizer
    // establishes next anyway; the analysis below needs it too.
    bool ChangedCFG = false;
    for (Loop *L : LI)
      ChangedCFG |= simplifyLoop(L, &DT, &LI, &SE, &AC, nullptr, /*PreserveLCSSA=*/false);

    // Decide everything against the unmodified loops, then apply.
    SmallVector<SmallVector<Instruction *, 8>, 8> Licenses;
    SmallVector<Plan, 4> Versions;
    for (Loop *L : LI.getLoopsInPreorder()) {
      if (!L->getLoopLatch() || !L->getLoopPreheader())
        continue;
      SmallVector<std::pair<Plan, std::string>, 2> Guarded;   // this loop's
      for (PHINode &PhiRef : L->getHeader()->phis()) {
        PHINode *Phi = &PhiRef;
        if (!Phi->getType()->isFloatTy() && !Phi->getType()->isDoubleTy())
          continue;
        RecurrenceDescriptor RD;
        if (!RecurrenceDescriptor::isReductionPHI(Phi, L, RD, nullptr, &AC, &DT, &SE))
          continue;
        RecurKind Kind = RD.getRecurrenceKind();
        if (Kind != RecurKind::FAdd && Kind != RecurKind::FMulAdd)
          continue;
        SmallVector<Instruction *, 8> All = chainOps(Phi, L);
        std::string Head =
            (Fn.getName() + " " + L->getHeader()->getName() + " " + locate(Phi, L, All)).str();
        if (!RD.getExactFPMathInst()) {
          report(Head + " declined already reassociable");
          continue;
        }
        if (O.Force) {
          Licenses.push_back(All);
          report(Head + " licensed forced");
          continue;
        }
        FactAnalysis FA(AC, DT, SE, L);
        Chain C;
        ChainWalker CW(Phi, L, FA);
        if (!CW.run(C)) {
          report(Head + " declined " + C.Why);
          continue;
        }
        Decision D = decide(Phi, L, RD, C, SE, FA);
        if (D.What == Decision::Licensed) {
          Licenses.push_back(C.Ops);
          report(Head + " licensed " + D.Why);
        } else if (D.What == Decision::Versioned && O.Version) {
          Guarded.push_back({{L, RD.getRecurrenceStartValue(), C.Ops, D}, Head});
        } else {
          if (D.What == Decision::Versioned)
            D.Why += " (versioning disabled)";
          report(Head + " declined " + D.Why);
        }
      }
      // One clone per loop, guarded by every guarded reduction's condition.
      for (auto &[P, Head] : Guarded) {
        Versions.push_back(P);
        report(Head + " versioned " + P.D.Why);
      }
    }

    for (auto &Ops : Licenses)
      license(Ops);
    SmallPtrSet<Loop *, 4> Done;
    for (Plan &P : Versions) {
      if (!Done.insert(P.L).second)
        continue;
      SmallVector<std::pair<Value *, Decision>, 2> Guards;
      for (Plan &Q : Versions)
        if (Q.L == P.L)
          Guards.push_back({Q.Start, Q.D});
      ValueToValueMapTy VMap;
      versionLoop(P.L, Guards, LI, DT, SE, VMap);
      for (Plan &Q : Versions) {
        if (Q.L != P.L)
          continue;
        SmallVector<Instruction *, 8> Cloned;
        for (Instruction *I : Q.Ops)
          Cloned.push_back(cast<Instruction>(VMap[I]));
        license(Cloned);
      }
      ChangedCFG = true;
    }
    if (ChangedCFG)
      return PreservedAnalyses::none();
    if (Licenses.empty())
      return PreservedAnalyses::all();
    PreservedAnalyses PA;
    PA.preserveSet<CFGAnalyses>();
    PA.preserve<ScalarEvolutionAnalysis>();
    PA.preserve<LoopAnalysis>();
    return PA;
  }
};

} // namespace

extern "C" LLVM_ATTRIBUTE_WEAK PassPluginLibraryInfo llvmGetPassPluginInfo() {
  return {LLVM_PLUGIN_API_VERSION, "ExactReduce", "1.0", [](PassBuilder &PB) {
            PB.registerVectorizerStartEPCallback(
                [](FunctionPassManager &FPM, OptimizationLevel) { FPM.addPass(ExactReducePass()); });
            PB.registerPipelineParsingCallback(
                [](StringRef Name, FunctionPassManager &FPM, ArrayRef<PassBuilder::PipelineElement>) {
                  if (Name != "exact-reduce")
                    return false;
                  FPM.addPass(ExactReducePass());
                  return true;
                });
          }};
}
