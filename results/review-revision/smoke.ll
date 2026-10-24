; ModuleID = 'llvm/tests/smoke.c'
source_filename = "llvm/tests/smoke.c"
target datalayout = "e-m:e-p270:32:32-p271:32:32-p272:64:64-i64:64-i128:128-f80:128-n8:16:32:64-S128"
target triple = "x86_64-pc-linux-gnu"

; Function Attrs: nofree norecurse nosync nounwind memory(argmem: read) uwtable
define dso_local double @sum_u8(ptr nocapture noundef readonly %0, i32 noundef %1) local_unnamed_addr #0 !dbg !14 {
  tail call void @llvm.dbg.value(metadata ptr %0, metadata !26, metadata !DIExpression()), !dbg !31
  tail call void @llvm.dbg.value(metadata i32 %1, metadata !27, metadata !DIExpression()), !dbg !31
  tail call void @llvm.dbg.value(metadata double 0.000000e+00, metadata !28, metadata !DIExpression()), !dbg !31
  tail call void @llvm.dbg.value(metadata i32 0, metadata !29, metadata !DIExpression()), !dbg !32
  %3 = icmp sgt i32 %1, 0, !dbg !33
  br i1 %3, label %4, label %42, !dbg !35

4:                                                ; preds = %2
  %5 = zext nneg i32 %1 to i64, !dbg !33
  %6 = icmp ult i32 %1, 16, !dbg !35
  br i1 %6, label %39, label %7, !dbg !35

7:                                                ; preds = %4
  %8 = and i64 %5, 2147483632, !dbg !35
  br label %9, !dbg !35

9:                                                ; preds = %9, %7
  %10 = phi i64 [ 0, %7 ], [ %31, %9 ], !dbg !36
  %11 = phi <4 x double> [ <double 0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, %7 ], [ %27, %9 ]
  %12 = phi <4 x double> [ <double -0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, %7 ], [ %28, %9 ]
  %13 = phi <4 x double> [ <double -0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, %7 ], [ %29, %9 ]
  %14 = phi <4 x double> [ <double -0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, %7 ], [ %30, %9 ]
  %15 = getelementptr inbounds i8, ptr %0, i64 %10, !dbg !37
  %16 = getelementptr inbounds i8, ptr %15, i64 4, !dbg !37
  %17 = getelementptr inbounds i8, ptr %15, i64 8, !dbg !37
  %18 = getelementptr inbounds i8, ptr %15, i64 12, !dbg !37
  %19 = load <4 x i8>, ptr %15, align 1, !dbg !37, !tbaa !38
  %20 = load <4 x i8>, ptr %16, align 1, !dbg !37, !tbaa !38
  %21 = load <4 x i8>, ptr %17, align 1, !dbg !37, !tbaa !38
  %22 = load <4 x i8>, ptr %18, align 1, !dbg !37, !tbaa !38
  %23 = uitofp <4 x i8> %19 to <4 x double>, !dbg !37
  %24 = uitofp <4 x i8> %20 to <4 x double>, !dbg !37
  %25 = uitofp <4 x i8> %21 to <4 x double>, !dbg !37
  %26 = uitofp <4 x i8> %22 to <4 x double>, !dbg !37
  %27 = fadd reassoc <4 x double> %11, %23, !dbg !41
  %28 = fadd reassoc <4 x double> %12, %24, !dbg !41
  %29 = fadd reassoc <4 x double> %13, %25, !dbg !41
  %30 = fadd reassoc <4 x double> %14, %26, !dbg !41
  %31 = add nuw i64 %10, 16, !dbg !36
  %32 = icmp eq i64 %31, %8, !dbg !36
  br i1 %32, label %33, label %9, !dbg !36, !llvm.loop !42

33:                                               ; preds = %9
  %34 = fadd reassoc <4 x double> %28, %27, !dbg !35
  %35 = fadd reassoc <4 x double> %29, %34, !dbg !35
  %36 = fadd reassoc <4 x double> %30, %35, !dbg !35
  %37 = tail call reassoc double @llvm.vector.reduce.fadd.v4f64(double -0.000000e+00, <4 x double> %36), !dbg !35
  %38 = icmp eq i64 %8, %5, !dbg !35
  br i1 %38, label %42, label %39, !dbg !35

39:                                               ; preds = %4, %33
  %40 = phi i64 [ 0, %4 ], [ %8, %33 ]
  %41 = phi double [ 0.000000e+00, %4 ], [ %37, %33 ]
  br label %44, !dbg !35

42:                                               ; preds = %44, %33, %2
  %43 = phi double [ 0.000000e+00, %2 ], [ %37, %33 ], [ %50, %44 ], !dbg !47
  ret double %43, !dbg !48

44:                                               ; preds = %39, %44
  %45 = phi i64 [ %51, %44 ], [ %40, %39 ]
  %46 = phi double [ %50, %44 ], [ %41, %39 ]
  tail call void @llvm.dbg.value(metadata i64 %45, metadata !29, metadata !DIExpression()), !dbg !32
  tail call void @llvm.dbg.value(metadata double %46, metadata !28, metadata !DIExpression()), !dbg !31
  %47 = getelementptr inbounds i8, ptr %0, i64 %45, !dbg !37
  %48 = load i8, ptr %47, align 1, !dbg !37, !tbaa !38
  %49 = uitofp i8 %48 to double, !dbg !37
  %50 = fadd reassoc double %46, %49, !dbg !41
  tail call void @llvm.dbg.value(metadata double %50, metadata !28, metadata !DIExpression()), !dbg !31
  %51 = add nuw nsw i64 %45, 1, !dbg !36
  tail call void @llvm.dbg.value(metadata i64 %51, metadata !29, metadata !DIExpression()), !dbg !32
  %52 = icmp eq i64 %51, %5, !dbg !33
  br i1 %52, label %42, label %44, !dbg !35, !llvm.loop !49
}

; Function Attrs: nofree norecurse nosync nounwind memory(argmem: read) uwtable
define dso_local double @sum_u8_long(ptr nocapture noundef readonly %0, i64 noundef %1) local_unnamed_addr #0 !dbg !50 {
  tail call void @llvm.dbg.value(metadata ptr %0, metadata !54, metadata !DIExpression()), !dbg !59
  tail call void @llvm.dbg.value(metadata i64 %1, metadata !55, metadata !DIExpression()), !dbg !59
  tail call void @llvm.dbg.value(metadata double 0.000000e+00, metadata !56, metadata !DIExpression()), !dbg !59
  tail call void @llvm.dbg.value(metadata i64 0, metadata !57, metadata !DIExpression()), !dbg !60
  %3 = icmp sgt i64 %1, 0, !dbg !61
  br i1 %3, label %4, label %68, !dbg !63

4:                                                ; preds = %2
  %5 = icmp ult i64 %1, 35322350018593, !dbg !63
  br i1 %5, label %9, label %6

6:                                                ; preds = %4
  %7 = and i64 %1, 7, !dbg !63
  %8 = and i64 %1, 9223372036854775800, !dbg !63
  br label %70, !dbg !63

9:                                                ; preds = %4
  %10 = icmp ult i64 %1, 16, !dbg !63
  br i1 %10, label %43, label %11, !dbg !63

11:                                               ; preds = %9
  %12 = and i64 %1, 70368744177648, !dbg !63
  br label %13, !dbg !63

13:                                               ; preds = %13, %11
  %14 = phi i64 [ 0, %11 ], [ %35, %13 ], !dbg !64
  %15 = phi <4 x double> [ <double 0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, %11 ], [ %31, %13 ]
  %16 = phi <4 x double> [ <double -0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, %11 ], [ %32, %13 ]
  %17 = phi <4 x double> [ <double -0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, %11 ], [ %33, %13 ]
  %18 = phi <4 x double> [ <double -0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, %11 ], [ %34, %13 ]
  %19 = getelementptr inbounds i8, ptr %0, i64 %14, !dbg !65
  %20 = getelementptr inbounds i8, ptr %19, i64 4, !dbg !65
  %21 = getelementptr inbounds i8, ptr %19, i64 8, !dbg !65
  %22 = getelementptr inbounds i8, ptr %19, i64 12, !dbg !65
  %23 = load <4 x i8>, ptr %19, align 1, !dbg !65, !tbaa !38
  %24 = load <4 x i8>, ptr %20, align 1, !dbg !65, !tbaa !38
  %25 = load <4 x i8>, ptr %21, align 1, !dbg !65, !tbaa !38
  %26 = load <4 x i8>, ptr %22, align 1, !dbg !65, !tbaa !38
  %27 = uitofp <4 x i8> %23 to <4 x double>, !dbg !65
  %28 = uitofp <4 x i8> %24 to <4 x double>, !dbg !65
  %29 = uitofp <4 x i8> %25 to <4 x double>, !dbg !65
  %30 = uitofp <4 x i8> %26 to <4 x double>, !dbg !65
  %31 = fadd reassoc <4 x double> %15, %27, !dbg !66
  %32 = fadd reassoc <4 x double> %16, %28, !dbg !66
  %33 = fadd reassoc <4 x double> %17, %29, !dbg !66
  %34 = fadd reassoc <4 x double> %18, %30, !dbg !66
  %35 = add nuw i64 %14, 16, !dbg !64
  %36 = icmp eq i64 %35, %12, !dbg !64
  br i1 %36, label %37, label %13, !dbg !64, !llvm.loop !67

37:                                               ; preds = %13
  %38 = fadd reassoc <4 x double> %32, %31, !dbg !63
  %39 = fadd reassoc <4 x double> %33, %38, !dbg !63
  %40 = fadd reassoc <4 x double> %34, %39, !dbg !63
  %41 = tail call reassoc double @llvm.vector.reduce.fadd.v4f64(double -0.000000e+00, <4 x double> %40), !dbg !63
  %42 = icmp eq i64 %12, %1, !dbg !63
  br i1 %42, label %68, label %43, !dbg !63

43:                                               ; preds = %9, %37
  %44 = phi i64 [ 0, %9 ], [ %12, %37 ]
  %45 = phi double [ 0.000000e+00, %9 ], [ %41, %37 ]
  br label %46, !dbg !63

46:                                               ; preds = %43, %46
  %47 = phi i64 [ %53, %46 ], [ %44, %43 ]
  %48 = phi double [ %52, %46 ], [ %45, %43 ]
  tail call void @llvm.dbg.value(metadata i64 %47, metadata !57, metadata !DIExpression()), !dbg !60
  tail call void @llvm.dbg.value(metadata double %48, metadata !56, metadata !DIExpression()), !dbg !59
  %49 = getelementptr inbounds i8, ptr %0, i64 %47, !dbg !65
  %50 = load i8, ptr %49, align 1, !dbg !65, !tbaa !38
  %51 = uitofp i8 %50 to double, !dbg !65
  %52 = fadd reassoc double %48, %51, !dbg !66
  tail call void @llvm.dbg.value(metadata double %52, metadata !56, metadata !DIExpression()), !dbg !59
  %53 = add nuw nsw i64 %47, 1, !dbg !64
  tail call void @llvm.dbg.value(metadata i64 %53, metadata !57, metadata !DIExpression()), !dbg !60
  %54 = icmp eq i64 %53, %1, !dbg !61
  br i1 %54, label %68, label %46, !dbg !63, !llvm.loop !69

55:                                               ; preds = %70
  %56 = icmp eq i64 %7, 0, !dbg !63
  br i1 %56, label %68, label %57, !dbg !63

57:                                               ; preds = %55, %57
  %58 = phi i64 [ %65, %57 ], [ %113, %55 ]
  %59 = phi double [ %64, %57 ], [ %112, %55 ]
  %60 = phi i64 [ %66, %57 ], [ 0, %55 ]
  tail call void @llvm.dbg.value(metadata i64 %58, metadata !57, metadata !DIExpression()), !dbg !60
  tail call void @llvm.dbg.value(metadata double %59, metadata !56, metadata !DIExpression()), !dbg !59
  %61 = getelementptr inbounds i8, ptr %0, i64 %58, !dbg !65
  %62 = load i8, ptr %61, align 1, !dbg !65, !tbaa !38
  %63 = uitofp i8 %62 to double, !dbg !65
  %64 = fadd double %59, %63, !dbg !66
  tail call void @llvm.dbg.value(metadata double %64, metadata !56, metadata !DIExpression()), !dbg !59
  %65 = add nuw nsw i64 %58, 1, !dbg !64
  tail call void @llvm.dbg.value(metadata i64 %65, metadata !57, metadata !DIExpression()), !dbg !60
  %66 = add i64 %60, 1, !dbg !63
  %67 = icmp eq i64 %66, %7, !dbg !63
  br i1 %67, label %68, label %57, !dbg !63, !llvm.loop !70

68:                                               ; preds = %55, %57, %46, %37, %2
  %69 = phi double [ 0.000000e+00, %2 ], [ %41, %37 ], [ %52, %46 ], [ %112, %55 ], [ %64, %57 ], !dbg !72
  ret double %69, !dbg !73

70:                                               ; preds = %70, %6
  %71 = phi i64 [ 0, %6 ], [ %113, %70 ]
  %72 = phi double [ 0.000000e+00, %6 ], [ %112, %70 ]
  %73 = phi i64 [ 0, %6 ], [ %114, %70 ]
  tail call void @llvm.dbg.value(metadata i64 %71, metadata !57, metadata !DIExpression()), !dbg !60
  tail call void @llvm.dbg.value(metadata double %72, metadata !56, metadata !DIExpression()), !dbg !59
  %74 = getelementptr inbounds i8, ptr %0, i64 %71, !dbg !65
  %75 = load i8, ptr %74, align 1, !dbg !65, !tbaa !38
  %76 = uitofp i8 %75 to double, !dbg !65
  %77 = fadd double %72, %76, !dbg !66
  tail call void @llvm.dbg.value(metadata double %77, metadata !56, metadata !DIExpression()), !dbg !59
  %78 = or disjoint i64 %71, 1, !dbg !64
  tail call void @llvm.dbg.value(metadata i64 %78, metadata !57, metadata !DIExpression()), !dbg !60
  tail call void @llvm.dbg.value(metadata i64 %78, metadata !57, metadata !DIExpression()), !dbg !60
  tail call void @llvm.dbg.value(metadata double %77, metadata !56, metadata !DIExpression()), !dbg !59
  %79 = getelementptr inbounds i8, ptr %0, i64 %78, !dbg !65
  %80 = load i8, ptr %79, align 1, !dbg !65, !tbaa !38
  %81 = uitofp i8 %80 to double, !dbg !65
  %82 = fadd double %77, %81, !dbg !66
  tail call void @llvm.dbg.value(metadata double %82, metadata !56, metadata !DIExpression()), !dbg !59
  %83 = or disjoint i64 %71, 2, !dbg !64
  tail call void @llvm.dbg.value(metadata i64 %83, metadata !57, metadata !DIExpression()), !dbg !60
  tail call void @llvm.dbg.value(metadata i64 %83, metadata !57, metadata !DIExpression()), !dbg !60
  tail call void @llvm.dbg.value(metadata double %82, metadata !56, metadata !DIExpression()), !dbg !59
  %84 = getelementptr inbounds i8, ptr %0, i64 %83, !dbg !65
  %85 = load i8, ptr %84, align 1, !dbg !65, !tbaa !38
  %86 = uitofp i8 %85 to double, !dbg !65
  %87 = fadd double %82, %86, !dbg !66
  tail call void @llvm.dbg.value(metadata double %87, metadata !56, metadata !DIExpression()), !dbg !59
  %88 = or disjoint i64 %71, 3, !dbg !64
  tail call void @llvm.dbg.value(metadata i64 %88, metadata !57, metadata !DIExpression()), !dbg !60
  tail call void @llvm.dbg.value(metadata i64 %88, metadata !57, metadata !DIExpression()), !dbg !60
  tail call void @llvm.dbg.value(metadata double %87, metadata !56, metadata !DIExpression()), !dbg !59
  %89 = getelementptr inbounds i8, ptr %0, i64 %88, !dbg !65
  %90 = load i8, ptr %89, align 1, !dbg !65, !tbaa !38
  %91 = uitofp i8 %90 to double, !dbg !65
  %92 = fadd double %87, %91, !dbg !66
  tail call void @llvm.dbg.value(metadata double %92, metadata !56, metadata !DIExpression()), !dbg !59
  %93 = or disjoint i64 %71, 4, !dbg !64
  tail call void @llvm.dbg.value(metadata i64 %93, metadata !57, metadata !DIExpression()), !dbg !60
  tail call void @llvm.dbg.value(metadata i64 %93, metadata !57, metadata !DIExpression()), !dbg !60
  tail call void @llvm.dbg.value(metadata double %92, metadata !56, metadata !DIExpression()), !dbg !59
  %94 = getelementptr inbounds i8, ptr %0, i64 %93, !dbg !65
  %95 = load i8, ptr %94, align 1, !dbg !65, !tbaa !38
  %96 = uitofp i8 %95 to double, !dbg !65
  %97 = fadd double %92, %96, !dbg !66
  tail call void @llvm.dbg.value(metadata double %97, metadata !56, metadata !DIExpression()), !dbg !59
  %98 = or disjoint i64 %71, 5, !dbg !64
  tail call void @llvm.dbg.value(metadata i64 %98, metadata !57, metadata !DIExpression()), !dbg !60
  tail call void @llvm.dbg.value(metadata i64 %98, metadata !57, metadata !DIExpression()), !dbg !60
  tail call void @llvm.dbg.value(metadata double %97, metadata !56, metadata !DIExpression()), !dbg !59
  %99 = getelementptr inbounds i8, ptr %0, i64 %98, !dbg !65
  %100 = load i8, ptr %99, align 1, !dbg !65, !tbaa !38
  %101 = uitofp i8 %100 to double, !dbg !65
  %102 = fadd double %97, %101, !dbg !66
  tail call void @llvm.dbg.value(metadata double %102, metadata !56, metadata !DIExpression()), !dbg !59
  %103 = or disjoint i64 %71, 6, !dbg !64
  tail call void @llvm.dbg.value(metadata i64 %103, metadata !57, metadata !DIExpression()), !dbg !60
  tail call void @llvm.dbg.value(metadata i64 %103, metadata !57, metadata !DIExpression()), !dbg !60
  tail call void @llvm.dbg.value(metadata double %102, metadata !56, metadata !DIExpression()), !dbg !59
  %104 = getelementptr inbounds i8, ptr %0, i64 %103, !dbg !65
  %105 = load i8, ptr %104, align 1, !dbg !65, !tbaa !38
  %106 = uitofp i8 %105 to double, !dbg !65
  %107 = fadd double %102, %106, !dbg !66
  tail call void @llvm.dbg.value(metadata double %107, metadata !56, metadata !DIExpression()), !dbg !59
  %108 = or disjoint i64 %71, 7, !dbg !64
  tail call void @llvm.dbg.value(metadata i64 %108, metadata !57, metadata !DIExpression()), !dbg !60
  tail call void @llvm.dbg.value(metadata i64 %108, metadata !57, metadata !DIExpression()), !dbg !60
  tail call void @llvm.dbg.value(metadata double %107, metadata !56, metadata !DIExpression()), !dbg !59
  %109 = getelementptr inbounds i8, ptr %0, i64 %108, !dbg !65
  %110 = load i8, ptr %109, align 1, !dbg !65, !tbaa !38
  %111 = uitofp i8 %110 to double, !dbg !65
  %112 = fadd double %107, %111, !dbg !66
  tail call void @llvm.dbg.value(metadata double %112, metadata !56, metadata !DIExpression()), !dbg !59
  %113 = add nuw nsw i64 %71, 8, !dbg !64
  tail call void @llvm.dbg.value(metadata i64 %113, metadata !57, metadata !DIExpression()), !dbg !60
  %114 = add nuw nsw i64 %73, 8, !dbg !63
  %115 = icmp eq i64 %114, %8, !dbg !63
  br i1 %115, label %55, label %70, !dbg !63, !llvm.loop !74
}

; Function Attrs: nofree norecurse nosync nounwind memory(argmem: read) uwtable
define dso_local double @dot_i16_long(ptr nocapture noundef readonly %0, ptr nocapture noundef readonly %1, i64 noundef %2) local_unnamed_addr #0 !dbg !75 {
  tail call void @llvm.dbg.value(metadata ptr %0, metadata !85, metadata !DIExpression()), !dbg !91
  tail call void @llvm.dbg.value(metadata ptr %1, metadata !86, metadata !DIExpression()), !dbg !91
  tail call void @llvm.dbg.value(metadata i64 %2, metadata !87, metadata !DIExpression()), !dbg !91
  tail call void @llvm.dbg.value(metadata double 0.000000e+00, metadata !88, metadata !DIExpression()), !dbg !91
  tail call void @llvm.dbg.value(metadata i64 0, metadata !89, metadata !DIExpression()), !dbg !92
  %4 = icmp sgt i64 %2, 0, !dbg !93
  br i1 %4, label %5, label %87, !dbg !95

5:                                                ; preds = %3
  %6 = icmp ult i64 %2, 8388609, !dbg !95
  br i1 %6, label %10, label %7

7:                                                ; preds = %5
  %8 = and i64 %2, 7, !dbg !95
  %9 = and i64 %2, 9223372036854775800, !dbg !95
  br label %89, !dbg !95

10:                                               ; preds = %5
  %11 = icmp ult i64 %2, 16, !dbg !95
  br i1 %11, label %56, label %12, !dbg !95

12:                                               ; preds = %10
  %13 = and i64 %2, 16777200, !dbg !95
  br label %14, !dbg !95

14:                                               ; preds = %14, %12
  %15 = phi i64 [ 0, %12 ], [ %48, %14 ], !dbg !96
  %16 = phi <4 x double> [ <double 0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, %12 ], [ %44, %14 ]
  %17 = phi <4 x double> [ <double -0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, %12 ], [ %45, %14 ]
  %18 = phi <4 x double> [ <double -0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, %12 ], [ %46, %14 ]
  %19 = phi <4 x double> [ <double -0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, %12 ], [ %47, %14 ]
  %20 = getelementptr inbounds i16, ptr %0, i64 %15, !dbg !97
  %21 = getelementptr inbounds i16, ptr %20, i64 4, !dbg !97
  %22 = getelementptr inbounds i16, ptr %20, i64 8, !dbg !97
  %23 = getelementptr inbounds i16, ptr %20, i64 12, !dbg !97
  %24 = load <4 x i16>, ptr %20, align 2, !dbg !97, !tbaa !98
  %25 = load <4 x i16>, ptr %21, align 2, !dbg !97, !tbaa !98
  %26 = load <4 x i16>, ptr %22, align 2, !dbg !97, !tbaa !98
  %27 = load <4 x i16>, ptr %23, align 2, !dbg !97, !tbaa !98
  %28 = sitofp <4 x i16> %24 to <4 x double>, !dbg !100
  %29 = sitofp <4 x i16> %25 to <4 x double>, !dbg !100
  %30 = sitofp <4 x i16> %26 to <4 x double>, !dbg !100
  %31 = sitofp <4 x i16> %27 to <4 x double>, !dbg !100
  %32 = getelementptr inbounds i16, ptr %1, i64 %15, !dbg !101
  %33 = getelementptr inbounds i16, ptr %32, i64 4, !dbg !101
  %34 = getelementptr inbounds i16, ptr %32, i64 8, !dbg !101
  %35 = getelementptr inbounds i16, ptr %32, i64 12, !dbg !101
  %36 = load <4 x i16>, ptr %32, align 2, !dbg !101, !tbaa !98
  %37 = load <4 x i16>, ptr %33, align 2, !dbg !101, !tbaa !98
  %38 = load <4 x i16>, ptr %34, align 2, !dbg !101, !tbaa !98
  %39 = load <4 x i16>, ptr %35, align 2, !dbg !101, !tbaa !98
  %40 = sitofp <4 x i16> %36 to <4 x double>, !dbg !101
  %41 = sitofp <4 x i16> %37 to <4 x double>, !dbg !101
  %42 = sitofp <4 x i16> %38 to <4 x double>, !dbg !101
  %43 = sitofp <4 x i16> %39 to <4 x double>, !dbg !101
  %44 = tail call reassoc <4 x double> @llvm.fmuladd.v4f64(<4 x double> %28, <4 x double> %40, <4 x double> %16), !dbg !102
  %45 = tail call reassoc <4 x double> @llvm.fmuladd.v4f64(<4 x double> %29, <4 x double> %41, <4 x double> %17), !dbg !102
  %46 = tail call reassoc <4 x double> @llvm.fmuladd.v4f64(<4 x double> %30, <4 x double> %42, <4 x double> %18), !dbg !102
  %47 = tail call reassoc <4 x double> @llvm.fmuladd.v4f64(<4 x double> %31, <4 x double> %43, <4 x double> %19), !dbg !102
  %48 = add nuw i64 %15, 16, !dbg !96
  %49 = icmp eq i64 %48, %13, !dbg !96
  br i1 %49, label %50, label %14, !dbg !96, !llvm.loop !103

50:                                               ; preds = %14
  %51 = fadd reassoc <4 x double> %45, %44, !dbg !95
  %52 = fadd reassoc <4 x double> %46, %51, !dbg !95
  %53 = fadd reassoc <4 x double> %47, %52, !dbg !95
  %54 = tail call reassoc double @llvm.vector.reduce.fadd.v4f64(double -0.000000e+00, <4 x double> %53), !dbg !95
  %55 = icmp eq i64 %13, %2, !dbg !95
  br i1 %55, label %87, label %56, !dbg !95

56:                                               ; preds = %10, %50
  %57 = phi i64 [ 0, %10 ], [ %13, %50 ]
  %58 = phi double [ 0.000000e+00, %10 ], [ %54, %50 ]
  br label %59, !dbg !95

59:                                               ; preds = %56, %59
  %60 = phi i64 [ %69, %59 ], [ %57, %56 ]
  %61 = phi double [ %68, %59 ], [ %58, %56 ]
  tail call void @llvm.dbg.value(metadata i64 %60, metadata !89, metadata !DIExpression()), !dbg !92
  tail call void @llvm.dbg.value(metadata double %61, metadata !88, metadata !DIExpression()), !dbg !91
  %62 = getelementptr inbounds i16, ptr %0, i64 %60, !dbg !97
  %63 = load i16, ptr %62, align 2, !dbg !97, !tbaa !98
  %64 = sitofp i16 %63 to double, !dbg !100
  %65 = getelementptr inbounds i16, ptr %1, i64 %60, !dbg !101
  %66 = load i16, ptr %65, align 2, !dbg !101, !tbaa !98
  %67 = sitofp i16 %66 to double, !dbg !101
  %68 = tail call reassoc double @llvm.fmuladd.f64(double %64, double %67, double %61), !dbg !102
  tail call void @llvm.dbg.value(metadata double %68, metadata !88, metadata !DIExpression()), !dbg !91
  %69 = add nuw nsw i64 %60, 1, !dbg !96
  tail call void @llvm.dbg.value(metadata i64 %69, metadata !89, metadata !DIExpression()), !dbg !92
  %70 = icmp eq i64 %69, %2, !dbg !93
  br i1 %70, label %87, label %59, !dbg !95, !llvm.loop !105

71:                                               ; preds = %89
  %72 = icmp eq i64 %8, 0, !dbg !95
  br i1 %72, label %87, label %73, !dbg !95

73:                                               ; preds = %71, %73
  %74 = phi i64 [ %84, %73 ], [ %156, %71 ]
  %75 = phi double [ %83, %73 ], [ %155, %71 ]
  %76 = phi i64 [ %85, %73 ], [ 0, %71 ]
  tail call void @llvm.dbg.value(metadata i64 %74, metadata !89, metadata !DIExpression()), !dbg !92
  tail call void @llvm.dbg.value(metadata double %75, metadata !88, metadata !DIExpression()), !dbg !91
  %77 = getelementptr inbounds i16, ptr %0, i64 %74, !dbg !97
  %78 = load i16, ptr %77, align 2, !dbg !97, !tbaa !98
  %79 = sitofp i16 %78 to double, !dbg !100
  %80 = getelementptr inbounds i16, ptr %1, i64 %74, !dbg !101
  %81 = load i16, ptr %80, align 2, !dbg !101, !tbaa !98
  %82 = sitofp i16 %81 to double, !dbg !101
  %83 = tail call double @llvm.fmuladd.f64(double %79, double %82, double %75), !dbg !102
  tail call void @llvm.dbg.value(metadata double %83, metadata !88, metadata !DIExpression()), !dbg !91
  %84 = add nuw nsw i64 %74, 1, !dbg !96
  tail call void @llvm.dbg.value(metadata i64 %84, metadata !89, metadata !DIExpression()), !dbg !92
  %85 = add i64 %76, 1, !dbg !95
  %86 = icmp eq i64 %85, %8, !dbg !95
  br i1 %86, label %87, label %73, !dbg !95, !llvm.loop !106

87:                                               ; preds = %71, %73, %59, %50, %3
  %88 = phi double [ 0.000000e+00, %3 ], [ %54, %50 ], [ %68, %59 ], [ %155, %71 ], [ %83, %73 ], !dbg !107
  ret double %88, !dbg !108

89:                                               ; preds = %89, %7
  %90 = phi i64 [ 0, %7 ], [ %156, %89 ]
  %91 = phi double [ 0.000000e+00, %7 ], [ %155, %89 ]
  %92 = phi i64 [ 0, %7 ], [ %157, %89 ]
  tail call void @llvm.dbg.value(metadata i64 %90, metadata !89, metadata !DIExpression()), !dbg !92
  tail call void @llvm.dbg.value(metadata double %91, metadata !88, metadata !DIExpression()), !dbg !91
  %93 = getelementptr inbounds i16, ptr %0, i64 %90, !dbg !97
  %94 = load i16, ptr %93, align 2, !dbg !97, !tbaa !98
  %95 = sitofp i16 %94 to double, !dbg !100
  %96 = getelementptr inbounds i16, ptr %1, i64 %90, !dbg !101
  %97 = load i16, ptr %96, align 2, !dbg !101, !tbaa !98
  %98 = sitofp i16 %97 to double, !dbg !101
  %99 = tail call double @llvm.fmuladd.f64(double %95, double %98, double %91), !dbg !102
  tail call void @llvm.dbg.value(metadata double %99, metadata !88, metadata !DIExpression()), !dbg !91
  %100 = or disjoint i64 %90, 1, !dbg !96
  tail call void @llvm.dbg.value(metadata i64 %100, metadata !89, metadata !DIExpression()), !dbg !92
  tail call void @llvm.dbg.value(metadata i64 %100, metadata !89, metadata !DIExpression()), !dbg !92
  tail call void @llvm.dbg.value(metadata double %99, metadata !88, metadata !DIExpression()), !dbg !91
  %101 = getelementptr inbounds i16, ptr %0, i64 %100, !dbg !97
  %102 = load i16, ptr %101, align 2, !dbg !97, !tbaa !98
  %103 = sitofp i16 %102 to double, !dbg !100
  %104 = getelementptr inbounds i16, ptr %1, i64 %100, !dbg !101
  %105 = load i16, ptr %104, align 2, !dbg !101, !tbaa !98
  %106 = sitofp i16 %105 to double, !dbg !101
  %107 = tail call double @llvm.fmuladd.f64(double %103, double %106, double %99), !dbg !102
  tail call void @llvm.dbg.value(metadata double %107, metadata !88, metadata !DIExpression()), !dbg !91
  %108 = or disjoint i64 %90, 2, !dbg !96
  tail call void @llvm.dbg.value(metadata i64 %108, metadata !89, metadata !DIExpression()), !dbg !92
  tail call void @llvm.dbg.value(metadata i64 %108, metadata !89, metadata !DIExpression()), !dbg !92
  tail call void @llvm.dbg.value(metadata double %107, metadata !88, metadata !DIExpression()), !dbg !91
  %109 = getelementptr inbounds i16, ptr %0, i64 %108, !dbg !97
  %110 = load i16, ptr %109, align 2, !dbg !97, !tbaa !98
  %111 = sitofp i16 %110 to double, !dbg !100
  %112 = getelementptr inbounds i16, ptr %1, i64 %108, !dbg !101
  %113 = load i16, ptr %112, align 2, !dbg !101, !tbaa !98
  %114 = sitofp i16 %113 to double, !dbg !101
  %115 = tail call double @llvm.fmuladd.f64(double %111, double %114, double %107), !dbg !102
  tail call void @llvm.dbg.value(metadata double %115, metadata !88, metadata !DIExpression()), !dbg !91
  %116 = or disjoint i64 %90, 3, !dbg !96
  tail call void @llvm.dbg.value(metadata i64 %116, metadata !89, metadata !DIExpression()), !dbg !92
  tail call void @llvm.dbg.value(metadata i64 %116, metadata !89, metadata !DIExpression()), !dbg !92
  tail call void @llvm.dbg.value(metadata double %115, metadata !88, metadata !DIExpression()), !dbg !91
  %117 = getelementptr inbounds i16, ptr %0, i64 %116, !dbg !97
  %118 = load i16, ptr %117, align 2, !dbg !97, !tbaa !98
  %119 = sitofp i16 %118 to double, !dbg !100
  %120 = getelementptr inbounds i16, ptr %1, i64 %116, !dbg !101
  %121 = load i16, ptr %120, align 2, !dbg !101, !tbaa !98
  %122 = sitofp i16 %121 to double, !dbg !101
  %123 = tail call double @llvm.fmuladd.f64(double %119, double %122, double %115), !dbg !102
  tail call void @llvm.dbg.value(metadata double %123, metadata !88, metadata !DIExpression()), !dbg !91
  %124 = or disjoint i64 %90, 4, !dbg !96
  tail call void @llvm.dbg.value(metadata i64 %124, metadata !89, metadata !DIExpression()), !dbg !92
  tail call void @llvm.dbg.value(metadata i64 %124, metadata !89, metadata !DIExpression()), !dbg !92
  tail call void @llvm.dbg.value(metadata double %123, metadata !88, metadata !DIExpression()), !dbg !91
  %125 = getelementptr inbounds i16, ptr %0, i64 %124, !dbg !97
  %126 = load i16, ptr %125, align 2, !dbg !97, !tbaa !98
  %127 = sitofp i16 %126 to double, !dbg !100
  %128 = getelementptr inbounds i16, ptr %1, i64 %124, !dbg !101
  %129 = load i16, ptr %128, align 2, !dbg !101, !tbaa !98
  %130 = sitofp i16 %129 to double, !dbg !101
  %131 = tail call double @llvm.fmuladd.f64(double %127, double %130, double %123), !dbg !102
  tail call void @llvm.dbg.value(metadata double %131, metadata !88, metadata !DIExpression()), !dbg !91
  %132 = or disjoint i64 %90, 5, !dbg !96
  tail call void @llvm.dbg.value(metadata i64 %132, metadata !89, metadata !DIExpression()), !dbg !92
  tail call void @llvm.dbg.value(metadata i64 %132, metadata !89, metadata !DIExpression()), !dbg !92
  tail call void @llvm.dbg.value(metadata double %131, metadata !88, metadata !DIExpression()), !dbg !91
  %133 = getelementptr inbounds i16, ptr %0, i64 %132, !dbg !97
  %134 = load i16, ptr %133, align 2, !dbg !97, !tbaa !98
  %135 = sitofp i16 %134 to double, !dbg !100
  %136 = getelementptr inbounds i16, ptr %1, i64 %132, !dbg !101
  %137 = load i16, ptr %136, align 2, !dbg !101, !tbaa !98
  %138 = sitofp i16 %137 to double, !dbg !101
  %139 = tail call double @llvm.fmuladd.f64(double %135, double %138, double %131), !dbg !102
  tail call void @llvm.dbg.value(metadata double %139, metadata !88, metadata !DIExpression()), !dbg !91
  %140 = or disjoint i64 %90, 6, !dbg !96
  tail call void @llvm.dbg.value(metadata i64 %140, metadata !89, metadata !DIExpression()), !dbg !92
  tail call void @llvm.dbg.value(metadata i64 %140, metadata !89, metadata !DIExpression()), !dbg !92
  tail call void @llvm.dbg.value(metadata double %139, metadata !88, metadata !DIExpression()), !dbg !91
  %141 = getelementptr inbounds i16, ptr %0, i64 %140, !dbg !97
  %142 = load i16, ptr %141, align 2, !dbg !97, !tbaa !98
  %143 = sitofp i16 %142 to double, !dbg !100
  %144 = getelementptr inbounds i16, ptr %1, i64 %140, !dbg !101
  %145 = load i16, ptr %144, align 2, !dbg !101, !tbaa !98
  %146 = sitofp i16 %145 to double, !dbg !101
  %147 = tail call double @llvm.fmuladd.f64(double %143, double %146, double %139), !dbg !102
  tail call void @llvm.dbg.value(metadata double %147, metadata !88, metadata !DIExpression()), !dbg !91
  %148 = or disjoint i64 %90, 7, !dbg !96
  tail call void @llvm.dbg.value(metadata i64 %148, metadata !89, metadata !DIExpression()), !dbg !92
  tail call void @llvm.dbg.value(metadata i64 %148, metadata !89, metadata !DIExpression()), !dbg !92
  tail call void @llvm.dbg.value(metadata double %147, metadata !88, metadata !DIExpression()), !dbg !91
  %149 = getelementptr inbounds i16, ptr %0, i64 %148, !dbg !97
  %150 = load i16, ptr %149, align 2, !dbg !97, !tbaa !98
  %151 = sitofp i16 %150 to double, !dbg !100
  %152 = getelementptr inbounds i16, ptr %1, i64 %148, !dbg !101
  %153 = load i16, ptr %152, align 2, !dbg !101, !tbaa !98
  %154 = sitofp i16 %153 to double, !dbg !101
  %155 = tail call double @llvm.fmuladd.f64(double %151, double %154, double %147), !dbg !102
  tail call void @llvm.dbg.value(metadata double %155, metadata !88, metadata !DIExpression()), !dbg !91
  %156 = add nuw nsw i64 %90, 8, !dbg !96
  tail call void @llvm.dbg.value(metadata i64 %156, metadata !89, metadata !DIExpression()), !dbg !92
  %157 = add nuw nsw i64 %92, 8, !dbg !95
  %158 = icmp eq i64 %157, %9, !dbg !95
  br i1 %158, label %71, label %89, !dbg !95, !llvm.loop !109
}

; Function Attrs: mustprogress nocallback nofree nosync nounwind speculatable willreturn memory(none)
declare double @llvm.fmuladd.f64(double, double, double) #1

; Function Attrs: nofree norecurse nosync nounwind memory(argmem: read) uwtable
define dso_local float @dot_i8_f32_1024(ptr nocapture noundef readonly %0, ptr nocapture noundef readonly %1) local_unnamed_addr #0 !dbg !110 {
  tail call void @llvm.dbg.value(metadata ptr %0, metadata !119, metadata !DIExpression()), !dbg !124
  tail call void @llvm.dbg.value(metadata ptr %1, metadata !120, metadata !DIExpression()), !dbg !124
  tail call void @llvm.dbg.value(metadata float 0.000000e+00, metadata !121, metadata !DIExpression()), !dbg !124
  tail call void @llvm.dbg.value(metadata i32 0, metadata !122, metadata !DIExpression()), !dbg !125
  br label %3, !dbg !126

3:                                                ; preds = %3, %2
  %4 = phi i64 [ 0, %2 ], [ %66, %3 ], !dbg !127
  %5 = phi <8 x float> [ <float 0.000000e+00, float -0.000000e+00, float -0.000000e+00, float -0.000000e+00, float -0.000000e+00, float -0.000000e+00, float -0.000000e+00, float -0.000000e+00>, %2 ], [ %62, %3 ]
  %6 = phi <8 x float> [ <float -0.000000e+00, float -0.000000e+00, float -0.000000e+00, float -0.000000e+00, float -0.000000e+00, float -0.000000e+00, float -0.000000e+00, float -0.000000e+00>, %2 ], [ %63, %3 ]
  %7 = phi <8 x float> [ <float -0.000000e+00, float -0.000000e+00, float -0.000000e+00, float -0.000000e+00, float -0.000000e+00, float -0.000000e+00, float -0.000000e+00, float -0.000000e+00>, %2 ], [ %64, %3 ]
  %8 = phi <8 x float> [ <float -0.000000e+00, float -0.000000e+00, float -0.000000e+00, float -0.000000e+00, float -0.000000e+00, float -0.000000e+00, float -0.000000e+00, float -0.000000e+00>, %2 ], [ %65, %3 ]
  %9 = getelementptr inbounds i8, ptr %0, i64 %4, !dbg !129
  %10 = getelementptr inbounds i8, ptr %9, i64 8, !dbg !129
  %11 = getelementptr inbounds i8, ptr %9, i64 16, !dbg !129
  %12 = getelementptr inbounds i8, ptr %9, i64 24, !dbg !129
  %13 = load <8 x i8>, ptr %9, align 1, !dbg !129, !tbaa !38
  %14 = load <8 x i8>, ptr %10, align 1, !dbg !129, !tbaa !38
  %15 = load <8 x i8>, ptr %11, align 1, !dbg !129, !tbaa !38
  %16 = load <8 x i8>, ptr %12, align 1, !dbg !129, !tbaa !38
  %17 = sitofp <8 x i8> %13 to <8 x float>, !dbg !130
  %18 = sitofp <8 x i8> %14 to <8 x float>, !dbg !130
  %19 = sitofp <8 x i8> %15 to <8 x float>, !dbg !130
  %20 = sitofp <8 x i8> %16 to <8 x float>, !dbg !130
  %21 = getelementptr inbounds i8, ptr %1, i64 %4, !dbg !131
  %22 = getelementptr inbounds i8, ptr %21, i64 8, !dbg !131
  %23 = getelementptr inbounds i8, ptr %21, i64 16, !dbg !131
  %24 = getelementptr inbounds i8, ptr %21, i64 24, !dbg !131
  %25 = load <8 x i8>, ptr %21, align 1, !dbg !131, !tbaa !38
  %26 = load <8 x i8>, ptr %22, align 1, !dbg !131, !tbaa !38
  %27 = load <8 x i8>, ptr %23, align 1, !dbg !131, !tbaa !38
  %28 = load <8 x i8>, ptr %24, align 1, !dbg !131, !tbaa !38
  %29 = sitofp <8 x i8> %25 to <8 x float>, !dbg !132
  %30 = sitofp <8 x i8> %26 to <8 x float>, !dbg !132
  %31 = sitofp <8 x i8> %27 to <8 x float>, !dbg !132
  %32 = sitofp <8 x i8> %28 to <8 x float>, !dbg !132
  %33 = tail call reassoc <8 x float> @llvm.fmuladd.v8f32(<8 x float> %17, <8 x float> %29, <8 x float> %5), !dbg !133
  %34 = tail call reassoc <8 x float> @llvm.fmuladd.v8f32(<8 x float> %18, <8 x float> %30, <8 x float> %6), !dbg !133
  %35 = tail call reassoc <8 x float> @llvm.fmuladd.v8f32(<8 x float> %19, <8 x float> %31, <8 x float> %7), !dbg !133
  %36 = tail call reassoc <8 x float> @llvm.fmuladd.v8f32(<8 x float> %20, <8 x float> %32, <8 x float> %8), !dbg !133
  %37 = or disjoint i64 %4, 32, !dbg !127
  %38 = getelementptr inbounds i8, ptr %0, i64 %37, !dbg !129
  %39 = getelementptr inbounds i8, ptr %38, i64 8, !dbg !129
  %40 = getelementptr inbounds i8, ptr %38, i64 16, !dbg !129
  %41 = getelementptr inbounds i8, ptr %38, i64 24, !dbg !129
  %42 = load <8 x i8>, ptr %38, align 1, !dbg !129, !tbaa !38
  %43 = load <8 x i8>, ptr %39, align 1, !dbg !129, !tbaa !38
  %44 = load <8 x i8>, ptr %40, align 1, !dbg !129, !tbaa !38
  %45 = load <8 x i8>, ptr %41, align 1, !dbg !129, !tbaa !38
  %46 = sitofp <8 x i8> %42 to <8 x float>, !dbg !130
  %47 = sitofp <8 x i8> %43 to <8 x float>, !dbg !130
  %48 = sitofp <8 x i8> %44 to <8 x float>, !dbg !130
  %49 = sitofp <8 x i8> %45 to <8 x float>, !dbg !130
  %50 = getelementptr inbounds i8, ptr %1, i64 %37, !dbg !131
  %51 = getelementptr inbounds i8, ptr %50, i64 8, !dbg !131
  %52 = getelementptr inbounds i8, ptr %50, i64 16, !dbg !131
  %53 = getelementptr inbounds i8, ptr %50, i64 24, !dbg !131
  %54 = load <8 x i8>, ptr %50, align 1, !dbg !131, !tbaa !38
  %55 = load <8 x i8>, ptr %51, align 1, !dbg !131, !tbaa !38
  %56 = load <8 x i8>, ptr %52, align 1, !dbg !131, !tbaa !38
  %57 = load <8 x i8>, ptr %53, align 1, !dbg !131, !tbaa !38
  %58 = sitofp <8 x i8> %54 to <8 x float>, !dbg !132
  %59 = sitofp <8 x i8> %55 to <8 x float>, !dbg !132
  %60 = sitofp <8 x i8> %56 to <8 x float>, !dbg !132
  %61 = sitofp <8 x i8> %57 to <8 x float>, !dbg !132
  %62 = tail call reassoc <8 x float> @llvm.fmuladd.v8f32(<8 x float> %46, <8 x float> %58, <8 x float> %33), !dbg !133
  %63 = tail call reassoc <8 x float> @llvm.fmuladd.v8f32(<8 x float> %47, <8 x float> %59, <8 x float> %34), !dbg !133
  %64 = tail call reassoc <8 x float> @llvm.fmuladd.v8f32(<8 x float> %48, <8 x float> %60, <8 x float> %35), !dbg !133
  %65 = tail call reassoc <8 x float> @llvm.fmuladd.v8f32(<8 x float> %49, <8 x float> %61, <8 x float> %36), !dbg !133
  %66 = add nuw nsw i64 %4, 64, !dbg !127
  %67 = icmp eq i64 %66, 1024, !dbg !127
  br i1 %67, label %68, label %3, !dbg !127, !llvm.loop !134

68:                                               ; preds = %3
  %69 = fadd reassoc <8 x float> %63, %62, !dbg !126
  %70 = fadd reassoc <8 x float> %64, %69, !dbg !126
  %71 = fadd reassoc <8 x float> %65, %70, !dbg !126
  %72 = tail call reassoc float @llvm.vector.reduce.fadd.v8f32(float -0.000000e+00, <8 x float> %71), !dbg !126
  ret float %72, !dbg !136
}

; Function Attrs: mustprogress nocallback nofree nosync nounwind speculatable willreturn memory(none)
declare float @llvm.fmuladd.f32(float, float, float) #1

; Function Attrs: nofree norecurse nosync nounwind memory(argmem: read) uwtable
define dso_local float @dot_i8_f32_2048(ptr nocapture noundef readonly %0, ptr nocapture noundef readonly %1) local_unnamed_addr #0 !dbg !137 {
  tail call void @llvm.dbg.value(metadata ptr %0, metadata !139, metadata !DIExpression()), !dbg !144
  tail call void @llvm.dbg.value(metadata ptr %1, metadata !140, metadata !DIExpression()), !dbg !144
  tail call void @llvm.dbg.value(metadata float 0.000000e+00, metadata !141, metadata !DIExpression()), !dbg !144
  tail call void @llvm.dbg.value(metadata i32 0, metadata !142, metadata !DIExpression()), !dbg !145
  br label %4, !dbg !146

3:                                                ; preds = %4
  ret float %69, !dbg !147

4:                                                ; preds = %4, %2
  %5 = phi i64 [ 0, %2 ], [ %70, %4 ]
  %6 = phi float [ 0.000000e+00, %2 ], [ %69, %4 ]
  tail call void @llvm.dbg.value(metadata i64 %5, metadata !142, metadata !DIExpression()), !dbg !145
  tail call void @llvm.dbg.value(metadata float %6, metadata !141, metadata !DIExpression()), !dbg !144
  %7 = getelementptr inbounds i8, ptr %0, i64 %5, !dbg !148
  %8 = load i8, ptr %7, align 1, !dbg !148, !tbaa !38
  %9 = sitofp i8 %8 to float, !dbg !150
  %10 = getelementptr inbounds i8, ptr %1, i64 %5, !dbg !151
  %11 = load i8, ptr %10, align 1, !dbg !151, !tbaa !38
  %12 = sitofp i8 %11 to float, !dbg !152
  %13 = tail call float @llvm.fmuladd.f32(float %9, float %12, float %6), !dbg !153
  tail call void @llvm.dbg.value(metadata float %13, metadata !141, metadata !DIExpression()), !dbg !144
  %14 = or disjoint i64 %5, 1, !dbg !154
  tail call void @llvm.dbg.value(metadata i64 %14, metadata !142, metadata !DIExpression()), !dbg !145
  tail call void @llvm.dbg.value(metadata i64 %14, metadata !142, metadata !DIExpression()), !dbg !145
  tail call void @llvm.dbg.value(metadata float %13, metadata !141, metadata !DIExpression()), !dbg !144
  %15 = getelementptr inbounds i8, ptr %0, i64 %14, !dbg !148
  %16 = load i8, ptr %15, align 1, !dbg !148, !tbaa !38
  %17 = sitofp i8 %16 to float, !dbg !150
  %18 = getelementptr inbounds i8, ptr %1, i64 %14, !dbg !151
  %19 = load i8, ptr %18, align 1, !dbg !151, !tbaa !38
  %20 = sitofp i8 %19 to float, !dbg !152
  %21 = tail call float @llvm.fmuladd.f32(float %17, float %20, float %13), !dbg !153
  tail call void @llvm.dbg.value(metadata float %21, metadata !141, metadata !DIExpression()), !dbg !144
  %22 = or disjoint i64 %5, 2, !dbg !154
  tail call void @llvm.dbg.value(metadata i64 %22, metadata !142, metadata !DIExpression()), !dbg !145
  tail call void @llvm.dbg.value(metadata i64 %22, metadata !142, metadata !DIExpression()), !dbg !145
  tail call void @llvm.dbg.value(metadata float %21, metadata !141, metadata !DIExpression()), !dbg !144
  %23 = getelementptr inbounds i8, ptr %0, i64 %22, !dbg !148
  %24 = load i8, ptr %23, align 1, !dbg !148, !tbaa !38
  %25 = sitofp i8 %24 to float, !dbg !150
  %26 = getelementptr inbounds i8, ptr %1, i64 %22, !dbg !151
  %27 = load i8, ptr %26, align 1, !dbg !151, !tbaa !38
  %28 = sitofp i8 %27 to float, !dbg !152
  %29 = tail call float @llvm.fmuladd.f32(float %25, float %28, float %21), !dbg !153
  tail call void @llvm.dbg.value(metadata float %29, metadata !141, metadata !DIExpression()), !dbg !144
  %30 = or disjoint i64 %5, 3, !dbg !154
  tail call void @llvm.dbg.value(metadata i64 %30, metadata !142, metadata !DIExpression()), !dbg !145
  tail call void @llvm.dbg.value(metadata i64 %30, metadata !142, metadata !DIExpression()), !dbg !145
  tail call void @llvm.dbg.value(metadata float %29, metadata !141, metadata !DIExpression()), !dbg !144
  %31 = getelementptr inbounds i8, ptr %0, i64 %30, !dbg !148
  %32 = load i8, ptr %31, align 1, !dbg !148, !tbaa !38
  %33 = sitofp i8 %32 to float, !dbg !150
  %34 = getelementptr inbounds i8, ptr %1, i64 %30, !dbg !151
  %35 = load i8, ptr %34, align 1, !dbg !151, !tbaa !38
  %36 = sitofp i8 %35 to float, !dbg !152
  %37 = tail call float @llvm.fmuladd.f32(float %33, float %36, float %29), !dbg !153
  tail call void @llvm.dbg.value(metadata float %37, metadata !141, metadata !DIExpression()), !dbg !144
  %38 = or disjoint i64 %5, 4, !dbg !154
  tail call void @llvm.dbg.value(metadata i64 %38, metadata !142, metadata !DIExpression()), !dbg !145
  tail call void @llvm.dbg.value(metadata i64 %38, metadata !142, metadata !DIExpression()), !dbg !145
  tail call void @llvm.dbg.value(metadata float %37, metadata !141, metadata !DIExpression()), !dbg !144
  %39 = getelementptr inbounds i8, ptr %0, i64 %38, !dbg !148
  %40 = load i8, ptr %39, align 1, !dbg !148, !tbaa !38
  %41 = sitofp i8 %40 to float, !dbg !150
  %42 = getelementptr inbounds i8, ptr %1, i64 %38, !dbg !151
  %43 = load i8, ptr %42, align 1, !dbg !151, !tbaa !38
  %44 = sitofp i8 %43 to float, !dbg !152
  %45 = tail call float @llvm.fmuladd.f32(float %41, float %44, float %37), !dbg !153
  tail call void @llvm.dbg.value(metadata float %45, metadata !141, metadata !DIExpression()), !dbg !144
  %46 = or disjoint i64 %5, 5, !dbg !154
  tail call void @llvm.dbg.value(metadata i64 %46, metadata !142, metadata !DIExpression()), !dbg !145
  tail call void @llvm.dbg.value(metadata i64 %46, metadata !142, metadata !DIExpression()), !dbg !145
  tail call void @llvm.dbg.value(metadata float %45, metadata !141, metadata !DIExpression()), !dbg !144
  %47 = getelementptr inbounds i8, ptr %0, i64 %46, !dbg !148
  %48 = load i8, ptr %47, align 1, !dbg !148, !tbaa !38
  %49 = sitofp i8 %48 to float, !dbg !150
  %50 = getelementptr inbounds i8, ptr %1, i64 %46, !dbg !151
  %51 = load i8, ptr %50, align 1, !dbg !151, !tbaa !38
  %52 = sitofp i8 %51 to float, !dbg !152
  %53 = tail call float @llvm.fmuladd.f32(float %49, float %52, float %45), !dbg !153
  tail call void @llvm.dbg.value(metadata float %53, metadata !141, metadata !DIExpression()), !dbg !144
  %54 = or disjoint i64 %5, 6, !dbg !154
  tail call void @llvm.dbg.value(metadata i64 %54, metadata !142, metadata !DIExpression()), !dbg !145
  tail call void @llvm.dbg.value(metadata i64 %54, metadata !142, metadata !DIExpression()), !dbg !145
  tail call void @llvm.dbg.value(metadata float %53, metadata !141, metadata !DIExpression()), !dbg !144
  %55 = getelementptr inbounds i8, ptr %0, i64 %54, !dbg !148
  %56 = load i8, ptr %55, align 1, !dbg !148, !tbaa !38
  %57 = sitofp i8 %56 to float, !dbg !150
  %58 = getelementptr inbounds i8, ptr %1, i64 %54, !dbg !151
  %59 = load i8, ptr %58, align 1, !dbg !151, !tbaa !38
  %60 = sitofp i8 %59 to float, !dbg !152
  %61 = tail call float @llvm.fmuladd.f32(float %57, float %60, float %53), !dbg !153
  tail call void @llvm.dbg.value(metadata float %61, metadata !141, metadata !DIExpression()), !dbg !144
  %62 = or disjoint i64 %5, 7, !dbg !154
  tail call void @llvm.dbg.value(metadata i64 %62, metadata !142, metadata !DIExpression()), !dbg !145
  tail call void @llvm.dbg.value(metadata i64 %62, metadata !142, metadata !DIExpression()), !dbg !145
  tail call void @llvm.dbg.value(metadata float %61, metadata !141, metadata !DIExpression()), !dbg !144
  %63 = getelementptr inbounds i8, ptr %0, i64 %62, !dbg !148
  %64 = load i8, ptr %63, align 1, !dbg !148, !tbaa !38
  %65 = sitofp i8 %64 to float, !dbg !150
  %66 = getelementptr inbounds i8, ptr %1, i64 %62, !dbg !151
  %67 = load i8, ptr %66, align 1, !dbg !151, !tbaa !38
  %68 = sitofp i8 %67 to float, !dbg !152
  %69 = tail call float @llvm.fmuladd.f32(float %65, float %68, float %61), !dbg !153
  tail call void @llvm.dbg.value(metadata float %69, metadata !141, metadata !DIExpression()), !dbg !144
  %70 = add nuw nsw i64 %5, 8, !dbg !154
  tail call void @llvm.dbg.value(metadata i64 %70, metadata !142, metadata !DIExpression()), !dbg !145
  %71 = icmp eq i64 %70, 2048, !dbg !155
  br i1 %71, label %3, label %4, !dbg !146, !llvm.loop !156
}

; Function Attrs: nofree norecurse nosync nounwind memory(argmem: read) uwtable
define dso_local double @dot_real(ptr nocapture noundef readonly %0, ptr nocapture noundef readonly %1, i32 noundef %2) local_unnamed_addr #0 !dbg !158 {
  tail call void @llvm.dbg.value(metadata ptr %0, metadata !164, metadata !DIExpression()), !dbg !170
  tail call void @llvm.dbg.value(metadata ptr %1, metadata !165, metadata !DIExpression()), !dbg !170
  tail call void @llvm.dbg.value(metadata i32 %2, metadata !166, metadata !DIExpression()), !dbg !170
  tail call void @llvm.dbg.value(metadata double 0.000000e+00, metadata !167, metadata !DIExpression()), !dbg !170
  tail call void @llvm.dbg.value(metadata i32 0, metadata !168, metadata !DIExpression()), !dbg !171
  %4 = icmp sgt i32 %2, 0, !dbg !172
  br i1 %4, label %5, label %28, !dbg !174

5:                                                ; preds = %3
  %6 = zext nneg i32 %2 to i64, !dbg !172
  %7 = and i64 %6, 7, !dbg !174
  %8 = icmp ult i32 %2, 8, !dbg !174
  br i1 %8, label %11, label %9, !dbg !174

9:                                                ; preds = %5
  %10 = and i64 %6, 2147483640, !dbg !174
  br label %30, !dbg !174

11:                                               ; preds = %30, %5
  %12 = phi double [ undef, %5 ], [ %80, %30 ]
  %13 = phi i64 [ 0, %5 ], [ %81, %30 ]
  %14 = phi double [ 0.000000e+00, %5 ], [ %80, %30 ]
  %15 = icmp eq i64 %7, 0, !dbg !174
  br i1 %15, label %28, label %16, !dbg !174

16:                                               ; preds = %11, %16
  %17 = phi i64 [ %25, %16 ], [ %13, %11 ]
  %18 = phi double [ %24, %16 ], [ %14, %11 ]
  %19 = phi i64 [ %26, %16 ], [ 0, %11 ]
  tail call void @llvm.dbg.value(metadata i64 %17, metadata !168, metadata !DIExpression()), !dbg !171
  tail call void @llvm.dbg.value(metadata double %18, metadata !167, metadata !DIExpression()), !dbg !170
  %20 = getelementptr inbounds double, ptr %0, i64 %17, !dbg !175
  %21 = load double, ptr %20, align 8, !dbg !175, !tbaa !176
  %22 = getelementptr inbounds double, ptr %1, i64 %17, !dbg !178
  %23 = load double, ptr %22, align 8, !dbg !178, !tbaa !176
  %24 = tail call double @llvm.fmuladd.f64(double %21, double %23, double %18), !dbg !179
  tail call void @llvm.dbg.value(metadata double %24, metadata !167, metadata !DIExpression()), !dbg !170
  %25 = add nuw nsw i64 %17, 1, !dbg !180
  tail call void @llvm.dbg.value(metadata i64 %25, metadata !168, metadata !DIExpression()), !dbg !171
  %26 = add i64 %19, 1, !dbg !174
  %27 = icmp eq i64 %26, %7, !dbg !174
  br i1 %27, label %28, label %16, !dbg !174, !llvm.loop !181

28:                                               ; preds = %11, %16, %3
  %29 = phi double [ 0.000000e+00, %3 ], [ %12, %11 ], [ %24, %16 ], !dbg !182
  ret double %29, !dbg !183

30:                                               ; preds = %30, %9
  %31 = phi i64 [ 0, %9 ], [ %81, %30 ]
  %32 = phi double [ 0.000000e+00, %9 ], [ %80, %30 ]
  %33 = phi i64 [ 0, %9 ], [ %82, %30 ]
  tail call void @llvm.dbg.value(metadata i64 %31, metadata !168, metadata !DIExpression()), !dbg !171
  tail call void @llvm.dbg.value(metadata double %32, metadata !167, metadata !DIExpression()), !dbg !170
  %34 = getelementptr inbounds double, ptr %0, i64 %31, !dbg !175
  %35 = load double, ptr %34, align 8, !dbg !175, !tbaa !176
  %36 = getelementptr inbounds double, ptr %1, i64 %31, !dbg !178
  %37 = load double, ptr %36, align 8, !dbg !178, !tbaa !176
  %38 = tail call double @llvm.fmuladd.f64(double %35, double %37, double %32), !dbg !179
  tail call void @llvm.dbg.value(metadata double %38, metadata !167, metadata !DIExpression()), !dbg !170
  %39 = or disjoint i64 %31, 1, !dbg !180
  tail call void @llvm.dbg.value(metadata i64 %39, metadata !168, metadata !DIExpression()), !dbg !171
  tail call void @llvm.dbg.value(metadata i64 %39, metadata !168, metadata !DIExpression()), !dbg !171
  tail call void @llvm.dbg.value(metadata double %38, metadata !167, metadata !DIExpression()), !dbg !170
  %40 = getelementptr inbounds double, ptr %0, i64 %39, !dbg !175
  %41 = load double, ptr %40, align 8, !dbg !175, !tbaa !176
  %42 = getelementptr inbounds double, ptr %1, i64 %39, !dbg !178
  %43 = load double, ptr %42, align 8, !dbg !178, !tbaa !176
  %44 = tail call double @llvm.fmuladd.f64(double %41, double %43, double %38), !dbg !179
  tail call void @llvm.dbg.value(metadata double %44, metadata !167, metadata !DIExpression()), !dbg !170
  %45 = or disjoint i64 %31, 2, !dbg !180
  tail call void @llvm.dbg.value(metadata i64 %45, metadata !168, metadata !DIExpression()), !dbg !171
  tail call void @llvm.dbg.value(metadata i64 %45, metadata !168, metadata !DIExpression()), !dbg !171
  tail call void @llvm.dbg.value(metadata double %44, metadata !167, metadata !DIExpression()), !dbg !170
  %46 = getelementptr inbounds double, ptr %0, i64 %45, !dbg !175
  %47 = load double, ptr %46, align 8, !dbg !175, !tbaa !176
  %48 = getelementptr inbounds double, ptr %1, i64 %45, !dbg !178
  %49 = load double, ptr %48, align 8, !dbg !178, !tbaa !176
  %50 = tail call double @llvm.fmuladd.f64(double %47, double %49, double %44), !dbg !179
  tail call void @llvm.dbg.value(metadata double %50, metadata !167, metadata !DIExpression()), !dbg !170
  %51 = or disjoint i64 %31, 3, !dbg !180
  tail call void @llvm.dbg.value(metadata i64 %51, metadata !168, metadata !DIExpression()), !dbg !171
  tail call void @llvm.dbg.value(metadata i64 %51, metadata !168, metadata !DIExpression()), !dbg !171
  tail call void @llvm.dbg.value(metadata double %50, metadata !167, metadata !DIExpression()), !dbg !170
  %52 = getelementptr inbounds double, ptr %0, i64 %51, !dbg !175
  %53 = load double, ptr %52, align 8, !dbg !175, !tbaa !176
  %54 = getelementptr inbounds double, ptr %1, i64 %51, !dbg !178
  %55 = load double, ptr %54, align 8, !dbg !178, !tbaa !176
  %56 = tail call double @llvm.fmuladd.f64(double %53, double %55, double %50), !dbg !179
  tail call void @llvm.dbg.value(metadata double %56, metadata !167, metadata !DIExpression()), !dbg !170
  %57 = or disjoint i64 %31, 4, !dbg !180
  tail call void @llvm.dbg.value(metadata i64 %57, metadata !168, metadata !DIExpression()), !dbg !171
  tail call void @llvm.dbg.value(metadata i64 %57, metadata !168, metadata !DIExpression()), !dbg !171
  tail call void @llvm.dbg.value(metadata double %56, metadata !167, metadata !DIExpression()), !dbg !170
  %58 = getelementptr inbounds double, ptr %0, i64 %57, !dbg !175
  %59 = load double, ptr %58, align 8, !dbg !175, !tbaa !176
  %60 = getelementptr inbounds double, ptr %1, i64 %57, !dbg !178
  %61 = load double, ptr %60, align 8, !dbg !178, !tbaa !176
  %62 = tail call double @llvm.fmuladd.f64(double %59, double %61, double %56), !dbg !179
  tail call void @llvm.dbg.value(metadata double %62, metadata !167, metadata !DIExpression()), !dbg !170
  %63 = or disjoint i64 %31, 5, !dbg !180
  tail call void @llvm.dbg.value(metadata i64 %63, metadata !168, metadata !DIExpression()), !dbg !171
  tail call void @llvm.dbg.value(metadata i64 %63, metadata !168, metadata !DIExpression()), !dbg !171
  tail call void @llvm.dbg.value(metadata double %62, metadata !167, metadata !DIExpression()), !dbg !170
  %64 = getelementptr inbounds double, ptr %0, i64 %63, !dbg !175
  %65 = load double, ptr %64, align 8, !dbg !175, !tbaa !176
  %66 = getelementptr inbounds double, ptr %1, i64 %63, !dbg !178
  %67 = load double, ptr %66, align 8, !dbg !178, !tbaa !176
  %68 = tail call double @llvm.fmuladd.f64(double %65, double %67, double %62), !dbg !179
  tail call void @llvm.dbg.value(metadata double %68, metadata !167, metadata !DIExpression()), !dbg !170
  %69 = or disjoint i64 %31, 6, !dbg !180
  tail call void @llvm.dbg.value(metadata i64 %69, metadata !168, metadata !DIExpression()), !dbg !171
  tail call void @llvm.dbg.value(metadata i64 %69, metadata !168, metadata !DIExpression()), !dbg !171
  tail call void @llvm.dbg.value(metadata double %68, metadata !167, metadata !DIExpression()), !dbg !170
  %70 = getelementptr inbounds double, ptr %0, i64 %69, !dbg !175
  %71 = load double, ptr %70, align 8, !dbg !175, !tbaa !176
  %72 = getelementptr inbounds double, ptr %1, i64 %69, !dbg !178
  %73 = load double, ptr %72, align 8, !dbg !178, !tbaa !176
  %74 = tail call double @llvm.fmuladd.f64(double %71, double %73, double %68), !dbg !179
  tail call void @llvm.dbg.value(metadata double %74, metadata !167, metadata !DIExpression()), !dbg !170
  %75 = or disjoint i64 %31, 7, !dbg !180
  tail call void @llvm.dbg.value(metadata i64 %75, metadata !168, metadata !DIExpression()), !dbg !171
  tail call void @llvm.dbg.value(metadata i64 %75, metadata !168, metadata !DIExpression()), !dbg !171
  tail call void @llvm.dbg.value(metadata double %74, metadata !167, metadata !DIExpression()), !dbg !170
  %76 = getelementptr inbounds double, ptr %0, i64 %75, !dbg !175
  %77 = load double, ptr %76, align 8, !dbg !175, !tbaa !176
  %78 = getelementptr inbounds double, ptr %1, i64 %75, !dbg !178
  %79 = load double, ptr %78, align 8, !dbg !178, !tbaa !176
  %80 = tail call double @llvm.fmuladd.f64(double %77, double %79, double %74), !dbg !179
  tail call void @llvm.dbg.value(metadata double %80, metadata !167, metadata !DIExpression()), !dbg !170
  %81 = add nuw nsw i64 %31, 8, !dbg !180
  tail call void @llvm.dbg.value(metadata i64 %81, metadata !168, metadata !DIExpression()), !dbg !171
  %82 = add i64 %33, 8, !dbg !174
  %83 = icmp eq i64 %82, %10, !dbg !174
  br i1 %83, label %11, label %30, !dbg !174, !llvm.loop !184
}

; Function Attrs: nofree norecurse nosync nounwind memory(argmem: read) uwtable
define dso_local double @sum2d_u8(ptr nocapture noundef readonly %0, i32 noundef %1, i32 noundef %2) local_unnamed_addr #0 !dbg !186 {
  tail call void @llvm.dbg.value(metadata ptr %0, metadata !190, metadata !DIExpression()), !dbg !199
  tail call void @llvm.dbg.value(metadata i32 %1, metadata !191, metadata !DIExpression()), !dbg !199
  tail call void @llvm.dbg.value(metadata i32 %2, metadata !192, metadata !DIExpression()), !dbg !199
  tail call void @llvm.dbg.value(metadata double 0.000000e+00, metadata !193, metadata !DIExpression()), !dbg !199
  tail call void @llvm.dbg.value(metadata i32 0, metadata !194, metadata !DIExpression()), !dbg !200
  %4 = icmp sgt i32 %1, 0, !dbg !201
  br i1 %4, label %5, label %145, !dbg !202

5:                                                ; preds = %3
  %6 = icmp sgt i32 %2, 0
  %7 = sext i32 %2 to i64
  br i1 %6, label %8, label %145, !dbg !203

8:                                                ; preds = %5
  %9 = zext nneg i32 %1 to i64, !dbg !201
  %10 = zext nneg i32 %2 to i64
  %11 = add nsw i64 %10, -1, !dbg !202
  %12 = and i64 %10, 7
  %13 = icmp ult i32 %2, 8
  %14 = and i64 %10, 2147483640
  %15 = icmp eq i64 %12, 0
  %16 = icmp ult i32 %2, 16
  %17 = and i64 %10, 2147483632
  %18 = icmp eq i64 %17, %10
  br label %19, !dbg !202

19:                                               ; preds = %8, %141
  %20 = phi i64 [ 0, %8 ], [ %143, %141 ]
  %21 = phi double [ 0.000000e+00, %8 ], [ %142, %141 ]
  tail call void @llvm.dbg.value(metadata i64 %20, metadata !194, metadata !DIExpression()), !dbg !200
  tail call void @llvm.dbg.value(metadata i32 0, metadata !196, metadata !DIExpression()), !dbg !204
  tail call void @llvm.dbg.value(metadata double %21, metadata !193, metadata !DIExpression()), !dbg !199
  %22 = mul nuw nsw i64 %20, %7
  %23 = getelementptr i8, ptr %0, i64 %22
  %24 = tail call double @llvm.fabs.f64(double %21), !dbg !203
  %25 = fcmp ole double %24, 0x4340000000000000, !dbg !203
  %26 = tail call double @llvm.trunc.f64(double %24), !dbg !203
  %27 = fcmp oeq double %24, %26, !dbg !203
  %28 = and i1 %25, %27, !dbg !203
  %29 = fptoui double %24 to i64, !dbg !203
  %30 = sub i64 9007199254740992, %29, !dbg !203
  %31 = udiv i64 %30, 255, !dbg !203
  %32 = select i1 %28, i64 %31, i64 35322350018592, !dbg !203
  %33 = icmp ult i64 %11, %32, !dbg !203
  %34 = and i1 %28, %33, !dbg !203
  br i1 %34, label %36, label %35

35:                                               ; preds = %19
  br i1 %13, label %126, label %80, !dbg !203

36:                                               ; preds = %19
  br i1 %16, label %68, label %37, !dbg !203

37:                                               ; preds = %36
  %38 = insertelement <4 x double> <double poison, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, double %21, i64 0, !dbg !203
  br label %39, !dbg !203

39:                                               ; preds = %39, %37
  %40 = phi i64 [ 0, %37 ], [ %61, %39 ], !dbg !205
  %41 = phi <4 x double> [ %38, %37 ], [ %57, %39 ]
  %42 = phi <4 x double> [ <double -0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, %37 ], [ %58, %39 ]
  %43 = phi <4 x double> [ <double -0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, %37 ], [ %59, %39 ]
  %44 = phi <4 x double> [ <double -0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, %37 ], [ %60, %39 ]
  %45 = getelementptr i8, ptr %23, i64 %40, !dbg !207
  %46 = getelementptr i8, ptr %45, i64 4, !dbg !207
  %47 = getelementptr i8, ptr %45, i64 8, !dbg !207
  %48 = getelementptr i8, ptr %45, i64 12, !dbg !207
  %49 = load <4 x i8>, ptr %45, align 1, !dbg !207, !tbaa !38
  %50 = load <4 x i8>, ptr %46, align 1, !dbg !207, !tbaa !38
  %51 = load <4 x i8>, ptr %47, align 1, !dbg !207, !tbaa !38
  %52 = load <4 x i8>, ptr %48, align 1, !dbg !207, !tbaa !38
  %53 = uitofp <4 x i8> %49 to <4 x double>, !dbg !207
  %54 = uitofp <4 x i8> %50 to <4 x double>, !dbg !207
  %55 = uitofp <4 x i8> %51 to <4 x double>, !dbg !207
  %56 = uitofp <4 x i8> %52 to <4 x double>, !dbg !207
  %57 = fadd reassoc <4 x double> %41, %53, !dbg !208
  %58 = fadd reassoc <4 x double> %42, %54, !dbg !208
  %59 = fadd reassoc <4 x double> %43, %55, !dbg !208
  %60 = fadd reassoc <4 x double> %44, %56, !dbg !208
  %61 = add nuw i64 %40, 16, !dbg !205
  %62 = icmp eq i64 %61, %17, !dbg !205
  br i1 %62, label %63, label %39, !dbg !205, !llvm.loop !209

63:                                               ; preds = %39
  %64 = fadd reassoc <4 x double> %58, %57, !dbg !203
  %65 = fadd reassoc <4 x double> %59, %64, !dbg !203
  %66 = fadd reassoc <4 x double> %60, %65, !dbg !203
  %67 = tail call reassoc double @llvm.vector.reduce.fadd.v4f64(double -0.000000e+00, <4 x double> %66), !dbg !203
  br i1 %18, label %141, label %68, !dbg !203

68:                                               ; preds = %36, %63
  %69 = phi i64 [ 0, %36 ], [ %17, %63 ]
  %70 = phi double [ %21, %36 ], [ %67, %63 ]
  br label %71, !dbg !203

71:                                               ; preds = %68, %71
  %72 = phi i64 [ %78, %71 ], [ %69, %68 ]
  %73 = phi double [ %77, %71 ], [ %70, %68 ]
  tail call void @llvm.dbg.value(metadata i64 %72, metadata !196, metadata !DIExpression()), !dbg !204
  tail call void @llvm.dbg.value(metadata double %73, metadata !193, metadata !DIExpression()), !dbg !199
  %74 = getelementptr i8, ptr %23, i64 %72, !dbg !207
  %75 = load i8, ptr %74, align 1, !dbg !207, !tbaa !38
  %76 = uitofp i8 %75 to double, !dbg !207
  %77 = fadd reassoc double %73, %76, !dbg !208
  tail call void @llvm.dbg.value(metadata double %77, metadata !193, metadata !DIExpression()), !dbg !199
  %78 = add nuw nsw i64 %72, 1, !dbg !205
  tail call void @llvm.dbg.value(metadata i64 %78, metadata !196, metadata !DIExpression()), !dbg !204
  %79 = icmp eq i64 %78, %10, !dbg !211
  br i1 %79, label %141, label %71, !dbg !203, !llvm.loop !212

80:                                               ; preds = %35, %80
  %81 = phi i64 [ %123, %80 ], [ 0, %35 ]
  %82 = phi double [ %122, %80 ], [ %21, %35 ]
  %83 = phi i64 [ %124, %80 ], [ 0, %35 ]
  tail call void @llvm.dbg.value(metadata i64 %81, metadata !196, metadata !DIExpression()), !dbg !204
  tail call void @llvm.dbg.value(metadata double %82, metadata !193, metadata !DIExpression()), !dbg !199
  %84 = getelementptr i8, ptr %23, i64 %81, !dbg !207
  %85 = load i8, ptr %84, align 1, !dbg !207, !tbaa !38
  %86 = uitofp i8 %85 to double, !dbg !207
  %87 = fadd double %82, %86, !dbg !208
  tail call void @llvm.dbg.value(metadata double %87, metadata !193, metadata !DIExpression()), !dbg !199
  %88 = or disjoint i64 %81, 1, !dbg !205
  tail call void @llvm.dbg.value(metadata i64 %88, metadata !196, metadata !DIExpression()), !dbg !204
  tail call void @llvm.dbg.value(metadata i64 %88, metadata !196, metadata !DIExpression()), !dbg !204
  tail call void @llvm.dbg.value(metadata double %87, metadata !193, metadata !DIExpression()), !dbg !199
  %89 = getelementptr i8, ptr %23, i64 %88, !dbg !207
  %90 = load i8, ptr %89, align 1, !dbg !207, !tbaa !38
  %91 = uitofp i8 %90 to double, !dbg !207
  %92 = fadd double %87, %91, !dbg !208
  tail call void @llvm.dbg.value(metadata double %92, metadata !193, metadata !DIExpression()), !dbg !199
  %93 = or disjoint i64 %81, 2, !dbg !205
  tail call void @llvm.dbg.value(metadata i64 %93, metadata !196, metadata !DIExpression()), !dbg !204
  tail call void @llvm.dbg.value(metadata i64 %93, metadata !196, metadata !DIExpression()), !dbg !204
  tail call void @llvm.dbg.value(metadata double %92, metadata !193, metadata !DIExpression()), !dbg !199
  %94 = getelementptr i8, ptr %23, i64 %93, !dbg !207
  %95 = load i8, ptr %94, align 1, !dbg !207, !tbaa !38
  %96 = uitofp i8 %95 to double, !dbg !207
  %97 = fadd double %92, %96, !dbg !208
  tail call void @llvm.dbg.value(metadata double %97, metadata !193, metadata !DIExpression()), !dbg !199
  %98 = or disjoint i64 %81, 3, !dbg !205
  tail call void @llvm.dbg.value(metadata i64 %98, metadata !196, metadata !DIExpression()), !dbg !204
  tail call void @llvm.dbg.value(metadata i64 %98, metadata !196, metadata !DIExpression()), !dbg !204
  tail call void @llvm.dbg.value(metadata double %97, metadata !193, metadata !DIExpression()), !dbg !199
  %99 = getelementptr i8, ptr %23, i64 %98, !dbg !207
  %100 = load i8, ptr %99, align 1, !dbg !207, !tbaa !38
  %101 = uitofp i8 %100 to double, !dbg !207
  %102 = fadd double %97, %101, !dbg !208
  tail call void @llvm.dbg.value(metadata double %102, metadata !193, metadata !DIExpression()), !dbg !199
  %103 = or disjoint i64 %81, 4, !dbg !205
  tail call void @llvm.dbg.value(metadata i64 %103, metadata !196, metadata !DIExpression()), !dbg !204
  tail call void @llvm.dbg.value(metadata i64 %103, metadata !196, metadata !DIExpression()), !dbg !204
  tail call void @llvm.dbg.value(metadata double %102, metadata !193, metadata !DIExpression()), !dbg !199
  %104 = getelementptr i8, ptr %23, i64 %103, !dbg !207
  %105 = load i8, ptr %104, align 1, !dbg !207, !tbaa !38
  %106 = uitofp i8 %105 to double, !dbg !207
  %107 = fadd double %102, %106, !dbg !208
  tail call void @llvm.dbg.value(metadata double %107, metadata !193, metadata !DIExpression()), !dbg !199
  %108 = or disjoint i64 %81, 5, !dbg !205
  tail call void @llvm.dbg.value(metadata i64 %108, metadata !196, metadata !DIExpression()), !dbg !204
  tail call void @llvm.dbg.value(metadata i64 %108, metadata !196, metadata !DIExpression()), !dbg !204
  tail call void @llvm.dbg.value(metadata double %107, metadata !193, metadata !DIExpression()), !dbg !199
  %109 = getelementptr i8, ptr %23, i64 %108, !dbg !207
  %110 = load i8, ptr %109, align 1, !dbg !207, !tbaa !38
  %111 = uitofp i8 %110 to double, !dbg !207
  %112 = fadd double %107, %111, !dbg !208
  tail call void @llvm.dbg.value(metadata double %112, metadata !193, metadata !DIExpression()), !dbg !199
  %113 = or disjoint i64 %81, 6, !dbg !205
  tail call void @llvm.dbg.value(metadata i64 %113, metadata !196, metadata !DIExpression()), !dbg !204
  tail call void @llvm.dbg.value(metadata i64 %113, metadata !196, metadata !DIExpression()), !dbg !204
  tail call void @llvm.dbg.value(metadata double %112, metadata !193, metadata !DIExpression()), !dbg !199
  %114 = getelementptr i8, ptr %23, i64 %113, !dbg !207
  %115 = load i8, ptr %114, align 1, !dbg !207, !tbaa !38
  %116 = uitofp i8 %115 to double, !dbg !207
  %117 = fadd double %112, %116, !dbg !208
  tail call void @llvm.dbg.value(metadata double %117, metadata !193, metadata !DIExpression()), !dbg !199
  %118 = or disjoint i64 %81, 7, !dbg !205
  tail call void @llvm.dbg.value(metadata i64 %118, metadata !196, metadata !DIExpression()), !dbg !204
  tail call void @llvm.dbg.value(metadata i64 %118, metadata !196, metadata !DIExpression()), !dbg !204
  tail call void @llvm.dbg.value(metadata double %117, metadata !193, metadata !DIExpression()), !dbg !199
  %119 = getelementptr i8, ptr %23, i64 %118, !dbg !207
  %120 = load i8, ptr %119, align 1, !dbg !207, !tbaa !38
  %121 = uitofp i8 %120 to double, !dbg !207
  %122 = fadd double %117, %121, !dbg !208
  tail call void @llvm.dbg.value(metadata double %122, metadata !193, metadata !DIExpression()), !dbg !199
  %123 = add nuw nsw i64 %81, 8, !dbg !205
  tail call void @llvm.dbg.value(metadata i64 %123, metadata !196, metadata !DIExpression()), !dbg !204
  %124 = add i64 %83, 8, !dbg !203
  %125 = icmp eq i64 %124, %14, !dbg !203
  br i1 %125, label %126, label %80, !dbg !203, !llvm.loop !213

126:                                              ; preds = %80, %35
  %127 = phi double [ undef, %35 ], [ %122, %80 ]
  %128 = phi i64 [ 0, %35 ], [ %123, %80 ]
  %129 = phi double [ %21, %35 ], [ %122, %80 ]
  br i1 %15, label %141, label %130, !dbg !203

130:                                              ; preds = %126, %130
  %131 = phi i64 [ %138, %130 ], [ %128, %126 ]
  %132 = phi double [ %137, %130 ], [ %129, %126 ]
  %133 = phi i64 [ %139, %130 ], [ 0, %126 ]
  tail call void @llvm.dbg.value(metadata i64 %131, metadata !196, metadata !DIExpression()), !dbg !204
  tail call void @llvm.dbg.value(metadata double %132, metadata !193, metadata !DIExpression()), !dbg !199
  %134 = getelementptr i8, ptr %23, i64 %131, !dbg !207
  %135 = load i8, ptr %134, align 1, !dbg !207, !tbaa !38
  %136 = uitofp i8 %135 to double, !dbg !207
  %137 = fadd double %132, %136, !dbg !208
  tail call void @llvm.dbg.value(metadata double %137, metadata !193, metadata !DIExpression()), !dbg !199
  %138 = add nuw nsw i64 %131, 1, !dbg !205
  tail call void @llvm.dbg.value(metadata i64 %138, metadata !196, metadata !DIExpression()), !dbg !204
  %139 = add i64 %133, 1, !dbg !203
  %140 = icmp eq i64 %139, %12, !dbg !203
  br i1 %140, label %141, label %130, !dbg !203, !llvm.loop !214

141:                                              ; preds = %126, %130, %71, %63
  %142 = phi double [ %67, %63 ], [ %77, %71 ], [ %127, %126 ], [ %137, %130 ], !dbg !208
  %143 = add nuw nsw i64 %20, 1, !dbg !215
  tail call void @llvm.dbg.value(metadata i64 %143, metadata !194, metadata !DIExpression()), !dbg !200
  tail call void @llvm.dbg.value(metadata double poison, metadata !193, metadata !DIExpression()), !dbg !199
  %144 = icmp eq i64 %143, %9, !dbg !201
  br i1 %144, label %145, label %19, !dbg !202, !llvm.loop !216

145:                                              ; preds = %141, %5, %3
  %146 = phi double [ 0.000000e+00, %3 ], [ 0.000000e+00, %5 ], [ %142, %141 ], !dbg !218
  ret double %146, !dbg !219
}

; Function Attrs: nofree norecurse nosync nounwind memory(argmem: read) uwtable
define dso_local double @cond_sum(ptr nocapture noundef readonly %0, i32 noundef %1) local_unnamed_addr #0 !dbg !220 {
  tail call void @llvm.dbg.value(metadata ptr %0, metadata !224, metadata !DIExpression()), !dbg !229
  tail call void @llvm.dbg.value(metadata i32 %1, metadata !225, metadata !DIExpression()), !dbg !229
  tail call void @llvm.dbg.value(metadata double 0.000000e+00, metadata !226, metadata !DIExpression()), !dbg !229
  tail call void @llvm.dbg.value(metadata i32 0, metadata !227, metadata !DIExpression()), !dbg !230
  %3 = icmp sgt i32 %1, 0, !dbg !231
  br i1 %3, label %4, label %50, !dbg !233

4:                                                ; preds = %2
  %5 = zext nneg i32 %1 to i64, !dbg !231
  %6 = icmp ult i32 %1, 16, !dbg !233
  br i1 %6, label %47, label %7, !dbg !233

7:                                                ; preds = %4
  %8 = and i64 %5, 2147483632, !dbg !233
  br label %9, !dbg !233

9:                                                ; preds = %9, %7
  %10 = phi i64 [ 0, %7 ], [ %39, %9 ], !dbg !234
  %11 = phi <4 x double> [ <double 0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, %7 ], [ %35, %9 ]
  %12 = phi <4 x double> [ <double -0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, %7 ], [ %36, %9 ]
  %13 = phi <4 x double> [ <double -0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, %7 ], [ %37, %9 ]
  %14 = phi <4 x double> [ <double -0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, %7 ], [ %38, %9 ]
  %15 = getelementptr inbounds i8, ptr %0, i64 %10, !dbg !235
  %16 = getelementptr inbounds i8, ptr %15, i64 4, !dbg !235
  %17 = getelementptr inbounds i8, ptr %15, i64 8, !dbg !235
  %18 = getelementptr inbounds i8, ptr %15, i64 12, !dbg !235
  %19 = load <4 x i8>, ptr %15, align 1, !dbg !235, !tbaa !38
  %20 = load <4 x i8>, ptr %16, align 1, !dbg !235, !tbaa !38
  %21 = load <4 x i8>, ptr %17, align 1, !dbg !235, !tbaa !38
  %22 = load <4 x i8>, ptr %18, align 1, !dbg !235, !tbaa !38
  %23 = icmp sgt <4 x i8> %19, zeroinitializer, !dbg !237
  %24 = icmp sgt <4 x i8> %20, zeroinitializer, !dbg !237
  %25 = icmp sgt <4 x i8> %21, zeroinitializer, !dbg !237
  %26 = icmp sgt <4 x i8> %22, zeroinitializer, !dbg !237
  %27 = sitofp <4 x i8> %19 to <4 x double>, !dbg !238
  %28 = sitofp <4 x i8> %20 to <4 x double>, !dbg !238
  %29 = sitofp <4 x i8> %21 to <4 x double>, !dbg !238
  %30 = sitofp <4 x i8> %22 to <4 x double>, !dbg !238
  %31 = select <4 x i1> %23, <4 x double> %27, <4 x double> <double -0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, !dbg !238
  %32 = select <4 x i1> %24, <4 x double> %28, <4 x double> <double -0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, !dbg !238
  %33 = select <4 x i1> %25, <4 x double> %29, <4 x double> <double -0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, !dbg !238
  %34 = select <4 x i1> %26, <4 x double> %30, <4 x double> <double -0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, !dbg !238
  %35 = fadd reassoc <4 x double> %11, %31, !dbg !238
  %36 = fadd reassoc <4 x double> %12, %32, !dbg !238
  %37 = fadd reassoc <4 x double> %13, %33, !dbg !238
  %38 = fadd reassoc <4 x double> %14, %34, !dbg !238
  %39 = add nuw i64 %10, 16, !dbg !234
  %40 = icmp eq i64 %39, %8, !dbg !234
  br i1 %40, label %41, label %9, !dbg !234, !llvm.loop !239

41:                                               ; preds = %9
  %42 = fadd reassoc <4 x double> %36, %35, !dbg !233
  %43 = fadd reassoc <4 x double> %37, %42, !dbg !233
  %44 = fadd reassoc <4 x double> %38, %43, !dbg !233
  %45 = tail call reassoc double @llvm.vector.reduce.fadd.v4f64(double -0.000000e+00, <4 x double> %44), !dbg !233
  %46 = icmp eq i64 %8, %5, !dbg !233
  br i1 %46, label %50, label %47, !dbg !233

47:                                               ; preds = %4, %41
  %48 = phi i64 [ 0, %4 ], [ %8, %41 ]
  %49 = phi double [ 0.000000e+00, %4 ], [ %45, %41 ]
  br label %52, !dbg !233

50:                                               ; preds = %52, %41, %2
  %51 = phi double [ 0.000000e+00, %2 ], [ %45, %41 ], [ %60, %52 ], !dbg !241
  ret double %51, !dbg !242

52:                                               ; preds = %47, %52
  %53 = phi i64 [ %61, %52 ], [ %48, %47 ]
  %54 = phi double [ %60, %52 ], [ %49, %47 ]
  tail call void @llvm.dbg.value(metadata i64 %53, metadata !227, metadata !DIExpression()), !dbg !230
  tail call void @llvm.dbg.value(metadata double %54, metadata !226, metadata !DIExpression()), !dbg !229
  %55 = getelementptr inbounds i8, ptr %0, i64 %53, !dbg !235
  %56 = load i8, ptr %55, align 1, !dbg !235, !tbaa !38
  %57 = icmp sgt i8 %56, 0, !dbg !237
  %58 = sitofp i8 %56 to double, !dbg !238
  %59 = select i1 %57, double %58, double -0.000000e+00, !dbg !238
  %60 = fadd reassoc double %54, %59, !dbg !238
  tail call void @llvm.dbg.value(metadata double %60, metadata !226, metadata !DIExpression()), !dbg !229
  %61 = add nuw nsw i64 %53, 1, !dbg !234
  tail call void @llvm.dbg.value(metadata i64 %61, metadata !227, metadata !DIExpression()), !dbg !230
  %62 = icmp eq i64 %61, %5, !dbg !231
  br i1 %62, label %50, label %52, !dbg !233, !llvm.loop !243
}

; Function Attrs: nofree norecurse nosync nounwind memory(argmem: readwrite) uwtable
define dso_local void @two_sums(ptr nocapture noundef readonly %0, i64 noundef %1, ptr nocapture noundef writeonly %2, ptr nocapture noundef writeonly %3) local_unnamed_addr #2 !dbg !244 {
  tail call void @llvm.dbg.value(metadata ptr %0, metadata !249, metadata !DIExpression()), !dbg !257
  tail call void @llvm.dbg.value(metadata i64 %1, metadata !250, metadata !DIExpression()), !dbg !257
  tail call void @llvm.dbg.value(metadata ptr %2, metadata !251, metadata !DIExpression()), !dbg !257
  tail call void @llvm.dbg.value(metadata ptr %3, metadata !252, metadata !DIExpression()), !dbg !257
  tail call void @llvm.dbg.value(metadata double 0.000000e+00, metadata !253, metadata !DIExpression()), !dbg !257
  tail call void @llvm.dbg.value(metadata double 0.000000e+00, metadata !254, metadata !DIExpression()), !dbg !257
  tail call void @llvm.dbg.value(metadata i64 0, metadata !255, metadata !DIExpression()), !dbg !258
  %5 = icmp sgt i64 %1, 0, !dbg !259
  br i1 %5, label %6, label %87, !dbg !261

6:                                                ; preds = %4
  %7 = icmp ult i64 %1, 138519019681, !dbg !261
  br i1 %7, label %11, label %8

8:                                                ; preds = %6
  %9 = and i64 %1, 7, !dbg !261
  %10 = and i64 %1, 9223372036854775800, !dbg !261
  br label %90, !dbg !261

11:                                               ; preds = %6
  %12 = icmp ult i64 %1, 16, !dbg !261
  br i1 %12, label %57, label %13, !dbg !261

13:                                               ; preds = %11
  %14 = and i64 %1, 274877906928, !dbg !261
  br label %15, !dbg !261

15:                                               ; preds = %15, %13
  %16 = phi i64 [ 0, %13 ], [ %45, %15 ], !dbg !262
  %17 = phi <4 x double> [ <double 0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, %13 ], [ %41, %15 ]
  %18 = phi <4 x double> [ <double -0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, %13 ], [ %42, %15 ]
  %19 = phi <4 x double> [ <double -0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, %13 ], [ %43, %15 ]
  %20 = phi <4 x double> [ <double -0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, %13 ], [ %44, %15 ]
  %21 = phi <4 x double> [ <double 0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, %13 ], [ %37, %15 ]
  %22 = phi <4 x double> [ <double -0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, %13 ], [ %38, %15 ]
  %23 = phi <4 x double> [ <double -0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, %13 ], [ %39, %15 ]
  %24 = phi <4 x double> [ <double -0.000000e+00, double -0.000000e+00, double -0.000000e+00, double -0.000000e+00>, %13 ], [ %40, %15 ]
  %25 = getelementptr inbounds i8, ptr %0, i64 %16, !dbg !263
  %26 = getelementptr inbounds i8, ptr %25, i64 4, !dbg !263
  %27 = getelementptr inbounds i8, ptr %25, i64 8, !dbg !263
  %28 = getelementptr inbounds i8, ptr %25, i64 12, !dbg !263
  %29 = load <4 x i8>, ptr %25, align 1, !dbg !263, !tbaa !38
  %30 = load <4 x i8>, ptr %26, align 1, !dbg !263, !tbaa !38
  %31 = load <4 x i8>, ptr %27, align 1, !dbg !263, !tbaa !38
  %32 = load <4 x i8>, ptr %28, align 1, !dbg !263, !tbaa !38
  %33 = uitofp <4 x i8> %29 to <4 x double>, !dbg !263
  %34 = uitofp <4 x i8> %30 to <4 x double>, !dbg !263
  %35 = uitofp <4 x i8> %31 to <4 x double>, !dbg !263
  %36 = uitofp <4 x i8> %32 to <4 x double>, !dbg !263
  %37 = fadd reassoc <4 x double> %21, %33, !dbg !265
  %38 = fadd reassoc <4 x double> %22, %34, !dbg !265
  %39 = fadd reassoc <4 x double> %23, %35, !dbg !265
  %40 = fadd reassoc <4 x double> %24, %36, !dbg !265
  %41 = tail call reassoc <4 x double> @llvm.fmuladd.v4f64(<4 x double> %33, <4 x double> %33, <4 x double> %17), !dbg !266
  %42 = tail call reassoc <4 x double> @llvm.fmuladd.v4f64(<4 x double> %34, <4 x double> %34, <4 x double> %18), !dbg !266
  %43 = tail call reassoc <4 x double> @llvm.fmuladd.v4f64(<4 x double> %35, <4 x double> %35, <4 x double> %19), !dbg !266
  %44 = tail call reassoc <4 x double> @llvm.fmuladd.v4f64(<4 x double> %36, <4 x double> %36, <4 x double> %20), !dbg !266
  %45 = add nuw i64 %16, 16, !dbg !262
  %46 = icmp eq i64 %45, %14, !dbg !262
  br i1 %46, label %47, label %15, !dbg !262, !llvm.loop !267

47:                                               ; preds = %15
  %48 = fadd reassoc <4 x double> %42, %41, !dbg !261
  %49 = fadd reassoc <4 x double> %43, %48, !dbg !261
  %50 = fadd reassoc <4 x double> %44, %49, !dbg !261
  %51 = tail call reassoc double @llvm.vector.reduce.fadd.v4f64(double -0.000000e+00, <4 x double> %50), !dbg !261
  %52 = fadd reassoc <4 x double> %38, %37, !dbg !261
  %53 = fadd reassoc <4 x double> %39, %52, !dbg !261
  %54 = fadd reassoc <4 x double> %40, %53, !dbg !261
  %55 = tail call reassoc double @llvm.vector.reduce.fadd.v4f64(double -0.000000e+00, <4 x double> %54), !dbg !261
  %56 = icmp eq i64 %14, %1, !dbg !261
  br i1 %56, label %87, label %57, !dbg !261

57:                                               ; preds = %11, %47
  %58 = phi i64 [ 0, %11 ], [ %14, %47 ]
  %59 = phi double [ 0.000000e+00, %11 ], [ %51, %47 ]
  %60 = phi double [ 0.000000e+00, %11 ], [ %55, %47 ]
  br label %61, !dbg !261

61:                                               ; preds = %57, %61
  %62 = phi i64 [ %70, %61 ], [ %58, %57 ]
  %63 = phi double [ %69, %61 ], [ %59, %57 ]
  %64 = phi double [ %68, %61 ], [ %60, %57 ]
  tail call void @llvm.dbg.value(metadata i64 %62, metadata !255, metadata !DIExpression()), !dbg !258
  tail call void @llvm.dbg.value(metadata double %63, metadata !254, metadata !DIExpression()), !dbg !257
  tail call void @llvm.dbg.value(metadata double %64, metadata !253, metadata !DIExpression()), !dbg !257
  %65 = getelementptr inbounds i8, ptr %0, i64 %62, !dbg !263
  %66 = load i8, ptr %65, align 1, !dbg !263, !tbaa !38
  %67 = uitofp i8 %66 to double, !dbg !263
  %68 = fadd reassoc double %64, %67, !dbg !265
  tail call void @llvm.dbg.value(metadata double %68, metadata !253, metadata !DIExpression()), !dbg !257
  %69 = tail call reassoc double @llvm.fmuladd.f64(double %67, double %67, double %63), !dbg !266
  tail call void @llvm.dbg.value(metadata double %69, metadata !254, metadata !DIExpression()), !dbg !257
  %70 = add nuw nsw i64 %62, 1, !dbg !262
  tail call void @llvm.dbg.value(metadata i64 %70, metadata !255, metadata !DIExpression()), !dbg !258
  %71 = icmp eq i64 %70, %1, !dbg !259
  br i1 %71, label %87, label %61, !dbg !261, !llvm.loop !269

72:                                               ; preds = %90
  %73 = icmp eq i64 %9, 0, !dbg !261
  br i1 %73, label %87, label %74, !dbg !261

74:                                               ; preds = %72, %74
  %75 = phi i64 [ %84, %74 ], [ %142, %72 ]
  %76 = phi double [ %83, %74 ], [ %141, %72 ]
  %77 = phi double [ %82, %74 ], [ %140, %72 ]
  %78 = phi i64 [ %85, %74 ], [ 0, %72 ]
  tail call void @llvm.dbg.value(metadata i64 %75, metadata !255, metadata !DIExpression()), !dbg !258
  tail call void @llvm.dbg.value(metadata double %76, metadata !254, metadata !DIExpression()), !dbg !257
  tail call void @llvm.dbg.value(metadata double %77, metadata !253, metadata !DIExpression()), !dbg !257
  %79 = getelementptr inbounds i8, ptr %0, i64 %75, !dbg !263
  %80 = load i8, ptr %79, align 1, !dbg !263, !tbaa !38
  %81 = uitofp i8 %80 to double, !dbg !263
  %82 = fadd double %77, %81, !dbg !265
  tail call void @llvm.dbg.value(metadata double %82, metadata !253, metadata !DIExpression()), !dbg !257
  %83 = tail call double @llvm.fmuladd.f64(double %81, double %81, double %76), !dbg !266
  tail call void @llvm.dbg.value(metadata double %83, metadata !254, metadata !DIExpression()), !dbg !257
  %84 = add nuw nsw i64 %75, 1, !dbg !262
  tail call void @llvm.dbg.value(metadata i64 %84, metadata !255, metadata !DIExpression()), !dbg !258
  %85 = add i64 %78, 1, !dbg !261
  %86 = icmp eq i64 %85, %9, !dbg !261
  br i1 %86, label %87, label %74, !dbg !261, !llvm.loop !270

87:                                               ; preds = %72, %74, %61, %47, %4
  %88 = phi double [ 0.000000e+00, %4 ], [ %55, %47 ], [ %68, %61 ], [ %140, %72 ], [ %82, %74 ], !dbg !271
  %89 = phi double [ 0.000000e+00, %4 ], [ %51, %47 ], [ %69, %61 ], [ %141, %72 ], [ %83, %74 ], !dbg !271
  store double %88, ptr %2, align 8, !dbg !272, !tbaa !176
  store double %89, ptr %3, align 8, !dbg !273, !tbaa !176
  ret void, !dbg !274

90:                                               ; preds = %90, %8
  %91 = phi i64 [ 0, %8 ], [ %142, %90 ]
  %92 = phi double [ 0.000000e+00, %8 ], [ %141, %90 ]
  %93 = phi double [ 0.000000e+00, %8 ], [ %140, %90 ]
  %94 = phi i64 [ 0, %8 ], [ %143, %90 ]
  tail call void @llvm.dbg.value(metadata i64 %91, metadata !255, metadata !DIExpression()), !dbg !258
  tail call void @llvm.dbg.value(metadata double %92, metadata !254, metadata !DIExpression()), !dbg !257
  tail call void @llvm.dbg.value(metadata double %93, metadata !253, metadata !DIExpression()), !dbg !257
  %95 = getelementptr inbounds i8, ptr %0, i64 %91, !dbg !263
  %96 = load i8, ptr %95, align 1, !dbg !263, !tbaa !38
  %97 = uitofp i8 %96 to double, !dbg !263
  %98 = fadd double %93, %97, !dbg !265
  tail call void @llvm.dbg.value(metadata double %98, metadata !253, metadata !DIExpression()), !dbg !257
  %99 = tail call double @llvm.fmuladd.f64(double %97, double %97, double %92), !dbg !266
  tail call void @llvm.dbg.value(metadata double %99, metadata !254, metadata !DIExpression()), !dbg !257
  %100 = or disjoint i64 %91, 1, !dbg !262
  tail call void @llvm.dbg.value(metadata i64 %100, metadata !255, metadata !DIExpression()), !dbg !258
  tail call void @llvm.dbg.value(metadata i64 %100, metadata !255, metadata !DIExpression()), !dbg !258
  tail call void @llvm.dbg.value(metadata double %99, metadata !254, metadata !DIExpression()), !dbg !257
  tail call void @llvm.dbg.value(metadata double %98, metadata !253, metadata !DIExpression()), !dbg !257
  %101 = getelementptr inbounds i8, ptr %0, i64 %100, !dbg !263
  %102 = load i8, ptr %101, align 1, !dbg !263, !tbaa !38
  %103 = uitofp i8 %102 to double, !dbg !263
  %104 = fadd double %98, %103, !dbg !265
  tail call void @llvm.dbg.value(metadata double %104, metadata !253, metadata !DIExpression()), !dbg !257
  %105 = tail call double @llvm.fmuladd.f64(double %103, double %103, double %99), !dbg !266
  tail call void @llvm.dbg.value(metadata double %105, metadata !254, metadata !DIExpression()), !dbg !257
  %106 = or disjoint i64 %91, 2, !dbg !262
  tail call void @llvm.dbg.value(metadata i64 %106, metadata !255, metadata !DIExpression()), !dbg !258
  tail call void @llvm.dbg.value(metadata i64 %106, metadata !255, metadata !DIExpression()), !dbg !258
  tail call void @llvm.dbg.value(metadata double %105, metadata !254, metadata !DIExpression()), !dbg !257
  tail call void @llvm.dbg.value(metadata double %104, metadata !253, metadata !DIExpression()), !dbg !257
  %107 = getelementptr inbounds i8, ptr %0, i64 %106, !dbg !263
  %108 = load i8, ptr %107, align 1, !dbg !263, !tbaa !38
  %109 = uitofp i8 %108 to double, !dbg !263
  %110 = fadd double %104, %109, !dbg !265
  tail call void @llvm.dbg.value(metadata double %110, metadata !253, metadata !DIExpression()), !dbg !257
  %111 = tail call double @llvm.fmuladd.f64(double %109, double %109, double %105), !dbg !266
  tail call void @llvm.dbg.value(metadata double %111, metadata !254, metadata !DIExpression()), !dbg !257
  %112 = or disjoint i64 %91, 3, !dbg !262
  tail call void @llvm.dbg.value(metadata i64 %112, metadata !255, metadata !DIExpression()), !dbg !258
  tail call void @llvm.dbg.value(metadata i64 %112, metadata !255, metadata !DIExpression()), !dbg !258
  tail call void @llvm.dbg.value(metadata double %111, metadata !254, metadata !DIExpression()), !dbg !257
  tail call void @llvm.dbg.value(metadata double %110, metadata !253, metadata !DIExpression()), !dbg !257
  %113 = getelementptr inbounds i8, ptr %0, i64 %112, !dbg !263
  %114 = load i8, ptr %113, align 1, !dbg !263, !tbaa !38
  %115 = uitofp i8 %114 to double, !dbg !263
  %116 = fadd double %110, %115, !dbg !265
  tail call void @llvm.dbg.value(metadata double %116, metadata !253, metadata !DIExpression()), !dbg !257
  %117 = tail call double @llvm.fmuladd.f64(double %115, double %115, double %111), !dbg !266
  tail call void @llvm.dbg.value(metadata double %117, metadata !254, metadata !DIExpression()), !dbg !257
  %118 = or disjoint i64 %91, 4, !dbg !262
  tail call void @llvm.dbg.value(metadata i64 %118, metadata !255, metadata !DIExpression()), !dbg !258
  tail call void @llvm.dbg.value(metadata i64 %118, metadata !255, metadata !DIExpression()), !dbg !258
  tail call void @llvm.dbg.value(metadata double %117, metadata !254, metadata !DIExpression()), !dbg !257
  tail call void @llvm.dbg.value(metadata double %116, metadata !253, metadata !DIExpression()), !dbg !257
  %119 = getelementptr inbounds i8, ptr %0, i64 %118, !dbg !263
  %120 = load i8, ptr %119, align 1, !dbg !263, !tbaa !38
  %121 = uitofp i8 %120 to double, !dbg !263
  %122 = fadd double %116, %121, !dbg !265
  tail call void @llvm.dbg.value(metadata double %122, metadata !253, metadata !DIExpression()), !dbg !257
  %123 = tail call double @llvm.fmuladd.f64(double %121, double %121, double %117), !dbg !266
  tail call void @llvm.dbg.value(metadata double %123, metadata !254, metadata !DIExpression()), !dbg !257
  %124 = or disjoint i64 %91, 5, !dbg !262
  tail call void @llvm.dbg.value(metadata i64 %124, metadata !255, metadata !DIExpression()), !dbg !258
  tail call void @llvm.dbg.value(metadata i64 %124, metadata !255, metadata !DIExpression()), !dbg !258
  tail call void @llvm.dbg.value(metadata double %123, metadata !254, metadata !DIExpression()), !dbg !257
  tail call void @llvm.dbg.value(metadata double %122, metadata !253, metadata !DIExpression()), !dbg !257
  %125 = getelementptr inbounds i8, ptr %0, i64 %124, !dbg !263
  %126 = load i8, ptr %125, align 1, !dbg !263, !tbaa !38
  %127 = uitofp i8 %126 to double, !dbg !263
  %128 = fadd double %122, %127, !dbg !265
  tail call void @llvm.dbg.value(metadata double %128, metadata !253, metadata !DIExpression()), !dbg !257
  %129 = tail call double @llvm.fmuladd.f64(double %127, double %127, double %123), !dbg !266
  tail call void @llvm.dbg.value(metadata double %129, metadata !254, metadata !DIExpression()), !dbg !257
  %130 = or disjoint i64 %91, 6, !dbg !262
  tail call void @llvm.dbg.value(metadata i64 %130, metadata !255, metadata !DIExpression()), !dbg !258
  tail call void @llvm.dbg.value(metadata i64 %130, metadata !255, metadata !DIExpression()), !dbg !258
  tail call void @llvm.dbg.value(metadata double %129, metadata !254, metadata !DIExpression()), !dbg !257
  tail call void @llvm.dbg.value(metadata double %128, metadata !253, metadata !DIExpression()), !dbg !257
  %131 = getelementptr inbounds i8, ptr %0, i64 %130, !dbg !263
  %132 = load i8, ptr %131, align 1, !dbg !263, !tbaa !38
  %133 = uitofp i8 %132 to double, !dbg !263
  %134 = fadd double %128, %133, !dbg !265
  tail call void @llvm.dbg.value(metadata double %134, metadata !253, metadata !DIExpression()), !dbg !257
  %135 = tail call double @llvm.fmuladd.f64(double %133, double %133, double %129), !dbg !266
  tail call void @llvm.dbg.value(metadata double %135, metadata !254, metadata !DIExpression()), !dbg !257
  %136 = or disjoint i64 %91, 7, !dbg !262
  tail call void @llvm.dbg.value(metadata i64 %136, metadata !255, metadata !DIExpression()), !dbg !258
  tail call void @llvm.dbg.value(metadata i64 %136, metadata !255, metadata !DIExpression()), !dbg !258
  tail call void @llvm.dbg.value(metadata double %135, metadata !254, metadata !DIExpression()), !dbg !257
  tail call void @llvm.dbg.value(metadata double %134, metadata !253, metadata !DIExpression()), !dbg !257
  %137 = getelementptr inbounds i8, ptr %0, i64 %136, !dbg !263
  %138 = load i8, ptr %137, align 1, !dbg !263, !tbaa !38
  %139 = uitofp i8 %138 to double, !dbg !263
  %140 = fadd double %134, %139, !dbg !265
  tail call void @llvm.dbg.value(metadata double %140, metadata !253, metadata !DIExpression()), !dbg !257
  %141 = tail call double @llvm.fmuladd.f64(double %139, double %139, double %135), !dbg !266
  tail call void @llvm.dbg.value(metadata double %141, metadata !254, metadata !DIExpression()), !dbg !257
  %142 = add nuw nsw i64 %91, 8, !dbg !262
  tail call void @llvm.dbg.value(metadata i64 %142, metadata !255, metadata !DIExpression()), !dbg !258
  %143 = add nuw nsw i64 %94, 8, !dbg !261
  %144 = icmp eq i64 %143, %10, !dbg !261
  br i1 %144, label %72, label %90, !dbg !261, !llvm.loop !275
}

; Function Attrs: nocallback nofree nosync nounwind speculatable willreturn memory(none)
declare void @llvm.dbg.value(metadata, metadata, metadata) #3

; Function Attrs: nocallback nofree nosync nounwind speculatable willreturn memory(none)
declare double @llvm.vector.reduce.fadd.v4f64(double, <4 x double>) #3

; Function Attrs: nocallback nofree nosync nounwind speculatable willreturn memory(none)
declare double @llvm.fabs.f64(double) #3

; Function Attrs: nocallback nofree nosync nounwind speculatable willreturn memory(none)
declare double @llvm.trunc.f64(double) #3

; Function Attrs: nocallback nofree nosync nounwind speculatable willreturn memory(none)
declare <4 x double> @llvm.fmuladd.v4f64(<4 x double>, <4 x double>, <4 x double>) #3

; Function Attrs: nocallback nofree nosync nounwind speculatable willreturn memory(none)
declare <8 x float> @llvm.fmuladd.v8f32(<8 x float>, <8 x float>, <8 x float>) #3

; Function Attrs: nocallback nofree nosync nounwind speculatable willreturn memory(none)
declare float @llvm.vector.reduce.fadd.v8f32(float, <8 x float>) #3

attributes #0 = { nofree norecurse nosync nounwind memory(argmem: read) uwtable "min-legal-vector-width"="0" "no-trapping-math"="true" "stack-protector-buffer-size"="8" "target-cpu"="arrowlake-s" "target-features"="+64bit,+adx,+aes,+avx,+avx2,+avxifma,+avxneconvert,+avxvnni,+avxvnniint16,+avxvnniint8,+bmi,+bmi2,+clflushopt,+clwb,+cmov,+cmpccxadd,+crc32,+cx16,+cx8,+f16c,+fma,+fsgsbase,+fxsr,+gfni,+invpcid,+lzcnt,+mmx,+movbe,+movdir64b,+movdiri,+pclmul,+popcnt,+prfchw,+rdpid,+rdrnd,+rdseed,+sahf,+serialize,+sha,+sha512,+shstk,+sm3,+sm4,+sse,+sse2,+sse3,+sse4.1,+sse4.2,+ssse3,+vaes,+vpclmulqdq,+waitpkg,+x87,+xsave,+xsavec,+xsaveopt,+xsaves,-amx-bf16,-amx-complex,-amx-fp16,-amx-int8,-amx-tile,-avx10.1-256,-avx10.1-512,-avx512bf16,-avx512bitalg,-avx512bw,-avx512cd,-avx512dq,-avx512er,-avx512f,-avx512fp16,-avx512ifma,-avx512pf,-avx512vbmi,-avx512vbmi2,-avx512vl,-avx512vnni,-avx512vp2intersect,-avx512vpopcntdq,-cldemote,-clzero,-enqcmd,-fma4,-hreset,-kl,-lwp,-mwaitx,-pconfig,-pku,-prefetchi,-prefetchwt1,-ptwrite,-raoint,-rdpru,-rtm,-sgx,-sse4a,-tbm,-tsxldtrk,-uintr,-usermsr,-wbnoinvd,-widekl,-xop" }
attributes #1 = { mustprogress nocallback nofree nosync nounwind speculatable willreturn memory(none) }
attributes #2 = { nofree norecurse nosync nounwind memory(argmem: readwrite) uwtable "min-legal-vector-width"="0" "no-trapping-math"="true" "stack-protector-buffer-size"="8" "target-cpu"="arrowlake-s" "target-features"="+64bit,+adx,+aes,+avx,+avx2,+avxifma,+avxneconvert,+avxvnni,+avxvnniint16,+avxvnniint8,+bmi,+bmi2,+clflushopt,+clwb,+cmov,+cmpccxadd,+crc32,+cx16,+cx8,+f16c,+fma,+fsgsbase,+fxsr,+gfni,+invpcid,+lzcnt,+mmx,+movbe,+movdir64b,+movdiri,+pclmul,+popcnt,+prfchw,+rdpid,+rdrnd,+rdseed,+sahf,+serialize,+sha,+sha512,+shstk,+sm3,+sm4,+sse,+sse2,+sse3,+sse4.1,+sse4.2,+ssse3,+vaes,+vpclmulqdq,+waitpkg,+x87,+xsave,+xsavec,+xsaveopt,+xsaves,-amx-bf16,-amx-complex,-amx-fp16,-amx-int8,-amx-tile,-avx10.1-256,-avx10.1-512,-avx512bf16,-avx512bitalg,-avx512bw,-avx512cd,-avx512dq,-avx512er,-avx512f,-avx512fp16,-avx512ifma,-avx512pf,-avx512vbmi,-avx512vbmi2,-avx512vl,-avx512vnni,-avx512vp2intersect,-avx512vpopcntdq,-cldemote,-clzero,-enqcmd,-fma4,-hreset,-kl,-lwp,-mwaitx,-pconfig,-pku,-prefetchi,-prefetchwt1,-ptwrite,-raoint,-rdpru,-rtm,-sgx,-sse4a,-tbm,-tsxldtrk,-uintr,-usermsr,-wbnoinvd,-widekl,-xop" }
attributes #3 = { nocallback nofree nosync nounwind speculatable willreturn memory(none) }

!llvm.dbg.cu = !{!0}
!llvm.module.flags = !{!6, !7, !8, !9, !10, !11, !12}
!llvm.ident = !{!13}

!0 = distinct !DICompileUnit(language: DW_LANG_C11, file: !1, producer: "Ubuntu clang version 18.1.3 (1ubuntu1)", isOptimized: true, runtimeVersion: 0, emissionKind: FullDebug, retainedTypes: !2, splitDebugInlining: false, nameTableKind: None)
!1 = !DIFile(filename: "llvm/tests/smoke.c", directory: "/mnt/c/Lenovo_data/matrixlang", checksumkind: CSK_MD5, checksum: "1bc7380b9e025624cc0502c66327d9ff")
!2 = !{!3, !4, !5}
!3 = !DIBasicType(name: "double", size: 64, encoding: DW_ATE_float)
!4 = !DIBasicType(name: "float", size: 32, encoding: DW_ATE_float)
!5 = !DIBasicType(name: "long", size: 64, encoding: DW_ATE_signed)
!6 = !{i32 7, !"Dwarf Version", i32 5}
!7 = !{i32 2, !"Debug Info Version", i32 3}
!8 = !{i32 1, !"wchar_size", i32 4}
!9 = !{i32 8, !"PIC Level", i32 2}
!10 = !{i32 7, !"PIE Level", i32 2}
!11 = !{i32 7, !"uwtable", i32 2}
!12 = !{i32 7, !"debug-info-assignment-tracking", i1 true}
!13 = !{!"Ubuntu clang version 18.1.3 (1ubuntu1)"}
!14 = distinct !DISubprogram(name: "sum_u8", scope: !1, file: !1, line: 2, type: !15, scopeLine: 2, flags: DIFlagPrototyped | DIFlagAllCallsDescribed, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !25)
!15 = !DISubroutineType(types: !16)
!16 = !{!3, !17, !24}
!17 = !DIDerivedType(tag: DW_TAG_pointer_type, baseType: !18, size: 64)
!18 = !DIDerivedType(tag: DW_TAG_const_type, baseType: !19)
!19 = !DIDerivedType(tag: DW_TAG_typedef, name: "uint8_t", file: !20, line: 24, baseType: !21)
!20 = !DIFile(filename: "/usr/include/x86_64-linux-gnu/bits/stdint-uintn.h", directory: "", checksumkind: CSK_MD5, checksum: "256fcabbefa27ca8cf5e6d37525e6e16")
!21 = !DIDerivedType(tag: DW_TAG_typedef, name: "__uint8_t", file: !22, line: 38, baseType: !23)
!22 = !DIFile(filename: "/usr/include/x86_64-linux-gnu/bits/types.h", directory: "", checksumkind: CSK_MD5, checksum: "e1865d9fe29fe1b5ced550b7ba458f9e")
!23 = !DIBasicType(name: "unsigned char", size: 8, encoding: DW_ATE_unsigned_char)
!24 = !DIBasicType(name: "int", size: 32, encoding: DW_ATE_signed)
!25 = !{!26, !27, !28, !29}
!26 = !DILocalVariable(name: "p", arg: 1, scope: !14, file: !1, line: 2, type: !17)
!27 = !DILocalVariable(name: "n", arg: 2, scope: !14, file: !1, line: 2, type: !24)
!28 = !DILocalVariable(name: "s", scope: !14, file: !1, line: 2, type: !3)
!29 = !DILocalVariable(name: "i", scope: !30, file: !1, line: 2, type: !24)
!30 = distinct !DILexicalBlock(scope: !14, file: !1, line: 2, column: 56)
!31 = !DILocation(line: 0, scope: !14)
!32 = !DILocation(line: 0, scope: !30)
!33 = !DILocation(line: 2, column: 74, scope: !34)
!34 = distinct !DILexicalBlock(scope: !30, file: !1, line: 2, column: 56)
!35 = !DILocation(line: 2, column: 56, scope: !30)
!36 = !DILocation(line: 2, column: 80, scope: !34)
!37 = !DILocation(line: 2, column: 89, scope: !34)
!38 = !{!39, !39, i64 0}
!39 = !{!"omnipotent char", !40, i64 0}
!40 = !{!"Simple C/C++ TBAA"}
!41 = !DILocation(line: 2, column: 86, scope: !34)
!42 = distinct !{!42, !35, !43, !44, !45, !46}
!43 = !DILocation(line: 2, column: 92, scope: !30)
!44 = !{!"llvm.loop.mustprogress"}
!45 = !{!"llvm.loop.isvectorized", i32 1}
!46 = !{!"llvm.loop.unroll.runtime.disable"}
!47 = !DILocation(line: 2, scope: !14)
!48 = !DILocation(line: 2, column: 95, scope: !14)
!49 = distinct !{!49, !35, !43, !44, !46, !45}
!50 = distinct !DISubprogram(name: "sum_u8_long", scope: !1, file: !1, line: 3, type: !51, scopeLine: 3, flags: DIFlagPrototyped | DIFlagAllCallsDescribed, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !53)
!51 = !DISubroutineType(types: !52)
!52 = !{!3, !17, !5}
!53 = !{!54, !55, !56, !57}
!54 = !DILocalVariable(name: "p", arg: 1, scope: !50, file: !1, line: 3, type: !17)
!55 = !DILocalVariable(name: "n", arg: 2, scope: !50, file: !1, line: 3, type: !5)
!56 = !DILocalVariable(name: "s", scope: !50, file: !1, line: 3, type: !3)
!57 = !DILocalVariable(name: "i", scope: !58, file: !1, line: 3, type: !5)
!58 = distinct !DILexicalBlock(scope: !50, file: !1, line: 3, column: 62)
!59 = !DILocation(line: 0, scope: !50)
!60 = !DILocation(line: 0, scope: !58)
!61 = !DILocation(line: 3, column: 81, scope: !62)
!62 = distinct !DILexicalBlock(scope: !58, file: !1, line: 3, column: 62)
!63 = !DILocation(line: 3, column: 62, scope: !58)
!64 = !DILocation(line: 3, column: 87, scope: !62)
!65 = !DILocation(line: 3, column: 96, scope: !62)
!66 = !DILocation(line: 3, column: 93, scope: !62)
!67 = distinct !{!67, !63, !68, !44, !45, !46}
!68 = !DILocation(line: 3, column: 99, scope: !58)
!69 = distinct !{!69, !63, !68, !44, !46, !45}
!70 = distinct !{!70, !71}
!71 = !{!"llvm.loop.unroll.disable"}
!72 = !DILocation(line: 3, scope: !50)
!73 = !DILocation(line: 3, column: 102, scope: !50)
!74 = distinct !{!74, !63, !68, !44}
!75 = distinct !DISubprogram(name: "dot_i16_long", scope: !1, file: !1, line: 4, type: !76, scopeLine: 4, flags: DIFlagPrototyped | DIFlagAllCallsDescribed, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !84)
!76 = !DISubroutineType(types: !77)
!77 = !{!3, !78, !78, !5}
!78 = !DIDerivedType(tag: DW_TAG_pointer_type, baseType: !79, size: 64)
!79 = !DIDerivedType(tag: DW_TAG_const_type, baseType: !80)
!80 = !DIDerivedType(tag: DW_TAG_typedef, name: "int16_t", file: !81, line: 25, baseType: !82)
!81 = !DIFile(filename: "/usr/include/x86_64-linux-gnu/bits/stdint-intn.h", directory: "", checksumkind: CSK_MD5, checksum: "649b383a60bfa3eb90e85840b2b0be20")
!82 = !DIDerivedType(tag: DW_TAG_typedef, name: "__int16_t", file: !22, line: 39, baseType: !83)
!83 = !DIBasicType(name: "short", size: 16, encoding: DW_ATE_signed)
!84 = !{!85, !86, !87, !88, !89}
!85 = !DILocalVariable(name: "a", arg: 1, scope: !75, file: !1, line: 4, type: !78)
!86 = !DILocalVariable(name: "b", arg: 2, scope: !75, file: !1, line: 4, type: !78)
!87 = !DILocalVariable(name: "n", arg: 3, scope: !75, file: !1, line: 4, type: !5)
!88 = !DILocalVariable(name: "s", scope: !75, file: !1, line: 4, type: !3)
!89 = !DILocalVariable(name: "i", scope: !90, file: !1, line: 4, type: !5)
!90 = distinct !DILexicalBlock(scope: !75, file: !1, line: 4, column: 81)
!91 = !DILocation(line: 0, scope: !75)
!92 = !DILocation(line: 0, scope: !90)
!93 = !DILocation(line: 4, column: 100, scope: !94)
!94 = distinct !DILexicalBlock(scope: !90, file: !1, line: 4, column: 81)
!95 = !DILocation(line: 4, column: 81, scope: !90)
!96 = !DILocation(line: 4, column: 106, scope: !94)
!97 = !DILocation(line: 4, column: 123, scope: !94)
!98 = !{!99, !99, i64 0}
!99 = !{!"short", !39, i64 0}
!100 = !DILocation(line: 4, column: 115, scope: !94)
!101 = !DILocation(line: 4, column: 130, scope: !94)
!102 = !DILocation(line: 4, column: 112, scope: !94)
!103 = distinct !{!103, !95, !104, !44, !45, !46}
!104 = !DILocation(line: 4, column: 133, scope: !90)
!105 = distinct !{!105, !95, !104, !44, !46, !45}
!106 = distinct !{!106, !71}
!107 = !DILocation(line: 4, scope: !75)
!108 = !DILocation(line: 4, column: 136, scope: !75)
!109 = distinct !{!109, !95, !104, !44}
!110 = distinct !DISubprogram(name: "dot_i8_f32_1024", scope: !1, file: !1, line: 5, type: !111, scopeLine: 5, flags: DIFlagPrototyped | DIFlagAllCallsDescribed, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !118)
!111 = !DISubroutineType(types: !112)
!112 = !{!4, !113, !113}
!113 = !DIDerivedType(tag: DW_TAG_pointer_type, baseType: !114, size: 64)
!114 = !DIDerivedType(tag: DW_TAG_const_type, baseType: !115)
!115 = !DIDerivedType(tag: DW_TAG_typedef, name: "int8_t", file: !81, line: 24, baseType: !116)
!116 = !DIDerivedType(tag: DW_TAG_typedef, name: "__int8_t", file: !22, line: 37, baseType: !117)
!117 = !DIBasicType(name: "signed char", size: 8, encoding: DW_ATE_signed_char)
!118 = !{!119, !120, !121, !122}
!119 = !DILocalVariable(name: "a", arg: 1, scope: !110, file: !1, line: 5, type: !113)
!120 = !DILocalVariable(name: "b", arg: 2, scope: !110, file: !1, line: 5, type: !113)
!121 = !DILocalVariable(name: "s", scope: !110, file: !1, line: 5, type: !4)
!122 = !DILocalVariable(name: "i", scope: !123, file: !1, line: 5, type: !24)
!123 = distinct !DILexicalBlock(scope: !110, file: !1, line: 5, column: 72)
!124 = !DILocation(line: 0, scope: !110)
!125 = !DILocation(line: 0, scope: !123)
!126 = !DILocation(line: 5, column: 72, scope: !123)
!127 = !DILocation(line: 5, column: 99, scope: !128)
!128 = distinct !DILexicalBlock(scope: !123, file: !1, line: 5, column: 72)
!129 = !DILocation(line: 5, column: 115, scope: !128)
!130 = !DILocation(line: 5, column: 108, scope: !128)
!131 = !DILocation(line: 5, column: 129, scope: !128)
!132 = !DILocation(line: 5, column: 122, scope: !128)
!133 = !DILocation(line: 5, column: 105, scope: !128)
!134 = distinct !{!134, !126, !135, !44, !45, !46}
!135 = !DILocation(line: 5, column: 132, scope: !123)
!136 = !DILocation(line: 5, column: 135, scope: !110)
!137 = distinct !DISubprogram(name: "dot_i8_f32_2048", scope: !1, file: !1, line: 6, type: !111, scopeLine: 6, flags: DIFlagPrototyped | DIFlagAllCallsDescribed, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !138)
!138 = !{!139, !140, !141, !142}
!139 = !DILocalVariable(name: "a", arg: 1, scope: !137, file: !1, line: 6, type: !113)
!140 = !DILocalVariable(name: "b", arg: 2, scope: !137, file: !1, line: 6, type: !113)
!141 = !DILocalVariable(name: "s", scope: !137, file: !1, line: 6, type: !4)
!142 = !DILocalVariable(name: "i", scope: !143, file: !1, line: 6, type: !24)
!143 = distinct !DILexicalBlock(scope: !137, file: !1, line: 6, column: 72)
!144 = !DILocation(line: 0, scope: !137)
!145 = !DILocation(line: 0, scope: !143)
!146 = !DILocation(line: 6, column: 72, scope: !143)
!147 = !DILocation(line: 6, column: 135, scope: !137)
!148 = !DILocation(line: 6, column: 115, scope: !149)
!149 = distinct !DILexicalBlock(scope: !143, file: !1, line: 6, column: 72)
!150 = !DILocation(line: 6, column: 108, scope: !149)
!151 = !DILocation(line: 6, column: 129, scope: !149)
!152 = !DILocation(line: 6, column: 122, scope: !149)
!153 = !DILocation(line: 6, column: 105, scope: !149)
!154 = !DILocation(line: 6, column: 99, scope: !149)
!155 = !DILocation(line: 6, column: 90, scope: !149)
!156 = distinct !{!156, !146, !157, !44}
!157 = !DILocation(line: 6, column: 132, scope: !143)
!158 = distinct !DISubprogram(name: "dot_real", scope: !1, file: !1, line: 7, type: !159, scopeLine: 7, flags: DIFlagPrototyped | DIFlagAllCallsDescribed, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !163)
!159 = !DISubroutineType(types: !160)
!160 = !{!3, !161, !161, !24}
!161 = !DIDerivedType(tag: DW_TAG_pointer_type, baseType: !162, size: 64)
!162 = !DIDerivedType(tag: DW_TAG_const_type, baseType: !3)
!163 = !{!164, !165, !166, !167, !168}
!164 = !DILocalVariable(name: "a", arg: 1, scope: !158, file: !1, line: 7, type: !161)
!165 = !DILocalVariable(name: "b", arg: 2, scope: !158, file: !1, line: 7, type: !161)
!166 = !DILocalVariable(name: "n", arg: 3, scope: !158, file: !1, line: 7, type: !24)
!167 = !DILocalVariable(name: "s", scope: !158, file: !1, line: 7, type: !3)
!168 = !DILocalVariable(name: "i", scope: !169, file: !1, line: 7, type: !24)
!169 = distinct !DILexicalBlock(scope: !158, file: !1, line: 7, column: 74)
!170 = !DILocation(line: 0, scope: !158)
!171 = !DILocation(line: 0, scope: !169)
!172 = !DILocation(line: 7, column: 92, scope: !173)
!173 = distinct !DILexicalBlock(scope: !169, file: !1, line: 7, column: 74)
!174 = !DILocation(line: 7, column: 74, scope: !169)
!175 = !DILocation(line: 7, column: 107, scope: !173)
!176 = !{!177, !177, i64 0}
!177 = !{!"double", !39, i64 0}
!178 = !DILocation(line: 7, column: 114, scope: !173)
!179 = !DILocation(line: 7, column: 104, scope: !173)
!180 = !DILocation(line: 7, column: 98, scope: !173)
!181 = distinct !{!181, !71}
!182 = !DILocation(line: 7, scope: !158)
!183 = !DILocation(line: 7, column: 120, scope: !158)
!184 = distinct !{!184, !174, !185, !44}
!185 = !DILocation(line: 7, column: 117, scope: !169)
!186 = distinct !DISubprogram(name: "sum2d_u8", scope: !1, file: !1, line: 8, type: !187, scopeLine: 8, flags: DIFlagPrototyped | DIFlagAllCallsDescribed, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !189)
!187 = !DISubroutineType(types: !188)
!188 = !{!3, !17, !24, !24}
!189 = !{!190, !191, !192, !193, !194, !196}
!190 = !DILocalVariable(name: "img", arg: 1, scope: !186, file: !1, line: 8, type: !17)
!191 = !DILocalVariable(name: "h", arg: 2, scope: !186, file: !1, line: 8, type: !24)
!192 = !DILocalVariable(name: "w", arg: 3, scope: !186, file: !1, line: 8, type: !24)
!193 = !DILocalVariable(name: "s", scope: !186, file: !1, line: 8, type: !3)
!194 = !DILocalVariable(name: "r", scope: !195, file: !1, line: 8, type: !24)
!195 = distinct !DILexicalBlock(scope: !186, file: !1, line: 8, column: 67)
!196 = !DILocalVariable(name: "c", scope: !197, file: !1, line: 8, type: !24)
!197 = distinct !DILexicalBlock(scope: !198, file: !1, line: 8, column: 95)
!198 = distinct !DILexicalBlock(scope: !195, file: !1, line: 8, column: 67)
!199 = !DILocation(line: 0, scope: !186)
!200 = !DILocation(line: 0, scope: !195)
!201 = !DILocation(line: 8, column: 85, scope: !198)
!202 = !DILocation(line: 8, column: 67, scope: !195)
!203 = !DILocation(line: 8, column: 95, scope: !197)
!204 = !DILocation(line: 0, scope: !197)
!205 = !DILocation(line: 8, column: 119, scope: !206)
!206 = distinct !DILexicalBlock(scope: !197, file: !1, line: 8, column: 95)
!207 = !DILocation(line: 8, column: 128, scope: !206)
!208 = !DILocation(line: 8, column: 125, scope: !206)
!209 = distinct !{!209, !203, !210, !44, !45, !46}
!210 = !DILocation(line: 8, column: 147, scope: !197)
!211 = !DILocation(line: 8, column: 113, scope: !206)
!212 = distinct !{!212, !203, !210, !44, !46, !45}
!213 = distinct !{!213, !203, !210, !44}
!214 = distinct !{!214, !71}
!215 = !DILocation(line: 8, column: 91, scope: !198)
!216 = distinct !{!216, !202, !217, !44}
!217 = !DILocation(line: 8, column: 147, scope: !195)
!218 = !DILocation(line: 8, column: 60, scope: !186)
!219 = !DILocation(line: 8, column: 150, scope: !186)
!220 = distinct !DISubprogram(name: "cond_sum", scope: !1, file: !1, line: 9, type: !221, scopeLine: 9, flags: DIFlagPrototyped | DIFlagAllCallsDescribed, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !223)
!221 = !DISubroutineType(types: !222)
!222 = !{!3, !113, !24}
!223 = !{!224, !225, !226, !227}
!224 = !DILocalVariable(name: "p", arg: 1, scope: !220, file: !1, line: 9, type: !113)
!225 = !DILocalVariable(name: "n", arg: 2, scope: !220, file: !1, line: 9, type: !24)
!226 = !DILocalVariable(name: "s", scope: !220, file: !1, line: 9, type: !3)
!227 = !DILocalVariable(name: "i", scope: !228, file: !1, line: 9, type: !24)
!228 = distinct !DILexicalBlock(scope: !220, file: !1, line: 9, column: 57)
!229 = !DILocation(line: 0, scope: !220)
!230 = !DILocation(line: 0, scope: !228)
!231 = !DILocation(line: 9, column: 75, scope: !232)
!232 = distinct !DILexicalBlock(scope: !228, file: !1, line: 9, column: 57)
!233 = !DILocation(line: 9, column: 57, scope: !228)
!234 = !DILocation(line: 9, column: 81, scope: !232)
!235 = !DILocation(line: 9, column: 89, scope: !236)
!236 = distinct !DILexicalBlock(scope: !232, file: !1, line: 9, column: 89)
!237 = !DILocation(line: 9, column: 94, scope: !236)
!238 = !DILocation(line: 9, column: 89, scope: !232)
!239 = distinct !{!239, !233, !240, !44, !45, !46}
!240 = !DILocation(line: 9, column: 107, scope: !228)
!241 = !DILocation(line: 9, scope: !220)
!242 = !DILocation(line: 9, column: 110, scope: !220)
!243 = distinct !{!243, !233, !240, !44, !46, !45}
!244 = distinct !DISubprogram(name: "two_sums", scope: !1, file: !1, line: 10, type: !245, scopeLine: 10, flags: DIFlagPrototyped | DIFlagAllCallsDescribed, spFlags: DISPFlagDefinition | DISPFlagOptimized, unit: !0, retainedNodes: !248)
!245 = !DISubroutineType(types: !246)
!246 = !{null, !17, !5, !247, !247}
!247 = !DIDerivedType(tag: DW_TAG_pointer_type, baseType: !3, size: 64)
!248 = !{!249, !250, !251, !252, !253, !254, !255}
!249 = !DILocalVariable(name: "p", arg: 1, scope: !244, file: !1, line: 10, type: !17)
!250 = !DILocalVariable(name: "n", arg: 2, scope: !244, file: !1, line: 10, type: !5)
!251 = !DILocalVariable(name: "a", arg: 3, scope: !244, file: !1, line: 10, type: !247)
!252 = !DILocalVariable(name: "b", arg: 4, scope: !244, file: !1, line: 10, type: !247)
!253 = !DILocalVariable(name: "s", scope: !244, file: !1, line: 10, type: !3)
!254 = !DILocalVariable(name: "t", scope: !244, file: !1, line: 10, type: !3)
!255 = !DILocalVariable(name: "i", scope: !256, file: !1, line: 10, type: !5)
!256 = distinct !DILexicalBlock(scope: !244, file: !1, line: 10, column: 86)
!257 = !DILocation(line: 0, scope: !244)
!258 = !DILocation(line: 0, scope: !256)
!259 = !DILocation(line: 10, column: 105, scope: !260)
!260 = distinct !DILexicalBlock(scope: !256, file: !1, line: 10, column: 86)
!261 = !DILocation(line: 10, column: 86, scope: !256)
!262 = !DILocation(line: 10, column: 111, scope: !260)
!263 = !DILocation(line: 10, column: 122, scope: !264)
!264 = distinct !DILexicalBlock(scope: !260, file: !1, line: 10, column: 115)
!265 = !DILocation(line: 10, column: 119, scope: !264)
!266 = !DILocation(line: 10, column: 130, scope: !264)
!267 = distinct !{!267, !261, !268, !44, !45, !46}
!268 = !DILocation(line: 10, column: 154, scope: !256)
!269 = distinct !{!269, !261, !268, !44, !46, !45}
!270 = distinct !{!270, !71}
!271 = !DILocation(line: 10, scope: !244)
!272 = !DILocation(line: 10, column: 159, scope: !244)
!273 = !DILocation(line: 10, column: 167, scope: !244)
!274 = !DILocation(line: 10, column: 172, scope: !244)
!275 = distinct !{!275, !261, !268, !44}
