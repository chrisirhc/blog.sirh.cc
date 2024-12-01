---
draft: true
layout: ../layouts/BlogPost.astro
title: Using a precompiled gRPC compiler in Bazel for Python
slug: precompiled-grpc-compiler-bazel-python
description: How to use a precompiled gRPC compiler for Python in Bazel
tags:
  - technical
added: 2024-11-25T16:56:48.487Z
---

Reference repository: https://github.com/chrisirhc/precompiled-grpc-in-bazel-python

Target Audience:
* If you're curious what the Developer Tools and Developer Platform Engineering teams do.
* Wondering what working with Bazel on a monorepo is like when you need to customize some tooling.
* Goes into customizing some rules without much depth into the rules themselves. It's a bit of learn by practicing by example.

Expects:
* some understanding of what tools that apply actions on code
* you don't have to know what protobuf or grpc are, except that they are tools that generate code in multiple programming languages including Python.

Context:
* Used an older version of protobuf and grpc in a bazel monorepo containing Python code.
* Wanted:
  * Type annotations in generated Python proto libraries
  * General greenkeeping (see evergreen engineering, greenkeeping terminology)
* Challenges encountered:
  * Mac users were seeing build errors since the repository used hermetic_cc_toolchain. It was the issue reported at https://github.com/uber/hermetic_cc_toolchain/issues/10#issuecomment-1653731027 .
* Tried:
  * Looking for precompiled toolchains. Found https://github.com/aspect-build/toolchains_protoc .
  * However, since the repository makes use of gRPC, the gRPC plugin itself requires a C++ compilation, as per https://github.com/aspect-build/toolchains_protoc/issues/21#issuecomment-2455503596 . 

Steps:

1. Prepare the executable tool.
    * Tools have their arguments as an input API. As long as the input arguments are compatible, we can swap out the tool. I checked that grpcio-tools offers the protoc compatible tool, since it is actually protoc but with a built-in grpc plugin.
    1. Add grpcio-tools Python package from pip.
    2. Make sure we can run it from py_binary as a tool.
2. Replace the tool used for the grpc compilation.
    1. Copy in python_grpc_compile definition and get it to work locally.
    2. Point grpc_plugin into a built-in tool, to validate whether it's using the right compiled protoc executable.

Gotchas:
* Which version of proto compiler is this using? Find out by going to: https://github.com/grpc/grpc/blob/v1.67.0/bazel/grpc_deps.bzl

Appendix:
* How did I set up the example repository?
    * Use bazel modules, current standard for adding different capabilities into a repo
    * Use the same example proto files from grpc/ and follow their layout.
        * Start from: https://github.com/rules-proto-grpc/rules_proto_grpc/tree/master/examples/python/python_grpc_compile
        * Trace it to https://github.com/rules-proto-grpc/rules_proto_grpc/tree/master/modules
    * Change paths so that the examples work again.
    * Fix weird edge cases with importing newer version bazel deps.