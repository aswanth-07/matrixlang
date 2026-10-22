# llvm/ -- the per-reduction licence as an LLVM 18 pass plugin.
#
#   make -C llvm            builds ExactReduce.so against the installed LLVM
#   make -C llvm test       runs the plugin's checks (tests/run.sh)
#
# The plugin links no LLVM libraries: clang and opt provide them at load time.

LLVM_CONFIG ?= llvm-config
CXX         ?= clang++
CLANG       ?= clang
CXXFLAGS_LLVM := $(shell $(LLVM_CONFIG) --cxxflags)

.PHONY: all test clean

all: ExactReduce.so

ExactReduce.so: ExactReduce.cpp
	$(CXX) $(CXXFLAGS_LLVM) -std=c++17 -O2 -Wall -Wextra -Wno-unused-parameter -fPIC -shared $< -o $@

test: ExactReduce.so
	CLANG=$(CLANG) bash tests/run.sh

clean:
	rm -f ExactReduce.so
