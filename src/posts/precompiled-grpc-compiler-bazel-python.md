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

Logical steps:
1. Set up an example repository running proto/grpc compiler.
2. Prepare the executable tool.
    * Tools have their arguments as an input API. As long as the input arguments are compatible, we can swap out the tool. I checked that grpcio-tools offers the protoc compatible tool, since it is actually protoc but with a built-in grpc plugin.
    1. Add grpcio-tools Python package from pip.
    2. Make sure we can run it from py_binary as a tool.
3. Replace the tool used for the compilation
    1. Copy in python_grpc_compile definition and get it to work locally.
    2. Point grpc_plugin into a built-in tool, to validate whether it's using the right compiled protoc executable.