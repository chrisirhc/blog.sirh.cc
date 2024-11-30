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
1. Setup an example repository running proto/grpc compiler.
2. Add grpcio-tools Python package from pip. 
3. Make sure we can run it from py_binary.
4. Copy in python_grpc_compile definition and get it to work locally.
5. Point grpc_plugin into a built-in tool, to validate whether it's using the right compiled protoc executable.
6. 