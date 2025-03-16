---
layout: ../layouts/BlogPost.astro
title: Using a Precompiled gRPC Compiler in Bazel for Python
slug: precompiled-grpc-compiler-bazel-python
description: How to use a precompiled gRPC compiler for Python in Bazel
tags:
  - technical
added: 2024-11-25T16:56:48.487Z
---
Reference repository: [GitHub - precompiled-grpc-in-bazel-python](https://github.com/chrisirhc/precompiled-grpc-in-bazel-python)

## Who Is This Written For?
* Those curious about what Developer Tools and Developer Platform Engineering teams work on.
* Developers seeking insights into working with Bazel on a monorepo.
* Anyone interested in customizing open-source rulesets in Bazel.
* Readers looking to learn through examples rather than in-depth theoretical explanations.

**Prerequisites:**
* Familiarity with tools that apply actions on code.
* No prior knowledge of protobuf or gRPC is necessary, but it helps to know they are tools that generate code in multiple programming languages, including Python.
* Some knowledge of Python-like syntax helps with reading the Bazel BUILD files which are in Starlark.

## A Quick Overview of Protocol Buffers (protobuf) and gRPC
[Protocol Buffers (protobuf)](https://protobuf.dev/) is a data serialization format similar to JSON. Protobuf works by defining schemas in `.proto` files, which describe the structure of serialized data. It supports multiple programming languages, including Python and Java. A code generator called `protoc` converts `.proto` files into language-specific code for serialization and deserialization. Learn more about it [here](https://protobuf.dev/).

[gRPC](https://grpc.io) is a Remote Procedure Call (RPC) framework built on top of protobuf. A simplified analogy would be to compare how [tRPC](https://trpc.io/docs/rpc) or REST relates to JSON in the same way that gRPC relates to protobuf. gRPC [has a ￼`protoc`￼ plugin](https://grpc.io/docs/what-is-grpc/introduction/#:~:text=protoc%20with%20a-,special%20gRPC%20plugin,-to%20generate%20code), which I refer to as the "gRPC plugin", to generate gRPC-specific code via the `protoc` tool.

## 🎬 Starting State 
### Python Monorepo Managed by Bazel (aka “the monorepo”)
The monorepo contains various Python services and libraries, some of which utilize protobuf. Consequently, `.proto` files are part of the repository. The setup uses [rules_proto](https://github.com/bazelbuild/rules_proto) and [rules_proto_grpc](https://rules-proto-grpc.com/) to integrate `protoc` and a gRPC plugin for compiling `.proto` files into Python code for interacting with protobuf and gRPC endpoints.

### Users Reported Build Failures on Mac
Local development on Mac fails due to [a build issue](https://github.com/uber/hermetic_cc_toolchain/issues/10#issuecomment-1653731027) with the hermetic cc toolchain, preventing successful compilation of `protoc`.

## 🎯 Goal State
* Enable successful builds on Mac.
* Minimize waiting times by avoiding C++ compilation for supported platforms.

## 🕵️‍♀️ Investigation
### Analyzing the Rule Definition
The problematic targets appear as follows in the example repository’s [BUILD.bazel file](https://github.com/chrisirhc/precompiled-grpc-in-bazel-python/blob/d2fe4a589614893bbcc5825aa259cb295abfdfa4/BUILD.bazel):

```python
load("@rules_proto_grpc_python//:defs.bzl", "python_grpc_compile")

python_grpc_compile(
    name = "thing_python_grpc",
    protos = ["@rules_proto_grpc_example_protos//:thing_proto"],
)
```

Looking deeper into the [python_grpc_compile](https://github.com/rules-proto-grpc/rules_proto_grpc/blob/d17b5b16c8b12143c6f1b78dabd6bbc228e89b58/modules/python/python_grpc_compile.bzl) rule definition reveals dependencies on `proto_plugin` and `grpc_plugin`:
```python
python_grpc_compile = rule(
    implementation = proto_compile_impl,
    attrs = dict(
        proto_compile_attrs,
        _plugins = attr.label_list(
            providers = [ProtoPluginInfo],
            default = [
                Label("//:proto_plugin"),
                Label("//:grpc_plugin"),
            ],
            cfg = "exec",
            doc = "List of protoc plugins to apply",
        ),
    ),
    toolchains = proto_compile_toolchains,
)
```

The proto_plugin and grpc_plugin targets in the [BUILD.bazel](https://github.com/rules-proto-grpc/rules_proto_grpc/blob/d17b5b16c8b12143c6f1b78dabd6bbc228e89b58/modules/python/BUILD.bazel):
```python
proto_plugin(
    name = "proto_plugin",
    exclusions = [
        "google/protobuf",
    ],
    outputs = ["{protopath|python}_pb2.py"],
    protoc_plugin_name = "python",
    visibility = ["//visibility:public"],
)

proto_plugin(
    name = "grpc_plugin",
    exclusions = [
        "google/protobuf",
    ],
    outputs = ["{protopath|python_grpc}_pb2_grpc.py"],
    tool = "@grpc//src/compiler:grpc_python_plugin",
    visibility = ["//visibility:public"],
)
```
Let's follow the `grpc_plugin`'s tool, `@grpc//src/compiler:grpc_python_plugin"`, to [it's definition](https://github.com/rules-proto-grpc/rules_proto_grpc/blob/d17b5b16c8b12143c6f1b78dabd6bbc228e89b58/modules/python/BUILD.bazel#L34).

We find that the [grpc_python_plugin](https://github.com/grpc/grpc/blob/fe8bd94c924f98ae4292ec8dfc969dbd802ec886/src/compiler/BUILD#L120) target, relies on a C++ source file, `python_plugin.cc`, which needs to be compiled (from C++):
```python
grpc_proto_plugin(
    name = "grpc_python_plugin",
    srcs = ["python_plugin.cc"],
    deps = [":grpc_plugin_support"],
)
```
### Exploring Alternative Solutions
Several community discussions confirmed the lack of a precompiled gRPC plugin, indicating that this is a common issue:
* Request for rules_proto_grpc to use a precompiled protoc executable ([rules_proto_grpc\#88](https://github.com/rules-proto-grpc/rules_proto_grpc/issues/88))
* [Comment in toolchains_protoc\#21](https://github.com/aspect-build/toolchains_protoc/issues/21#issuecomment-2455503596) indicating that usages of Python gRPC plugin require C++ compilation
* Request for a precompiled gRPC plugin ([gprc\#38078](https://github.com/grpc/grpc/issues/38078))
### Identifying Precompiled gRPC Plugin Options
The [gRPC’s Python Quick start](https://grpc.io/docs/languages/python/quickstart/) mentions using the [`grpcio-tools` package](https://pypi.org/project/grpcio-tools/), which includes a [built-in precompiled gRPC plugin](https://pypi.org/project/grpcio-tools/#:~:text=INCLUDE%20%2D%2Dpython_out=$OUTPUT%20%2D%2D-,grpc_python_out,-=$OUTPUT%20$PROTO_FILES). It provides a `protoc`-compatible CLI ([supporting the same arguments](https://pypi.org/project/grpcio-tools/#:~:text=Usage)):
```bash
$ python -m grpc_tools.protoc -I$INCLUDE --python_out=$OUTPUT --grpc_python_out=$OUTPUT $PROTO_FILES
```
Note how the arguments match those in of protoc per the [Protobuf Python Generated Code Documentation](https://protobuf.dev/reference/python/python-generated/#invocation) :
* `-I` specifies the directory to look for .proto files used in imports.
* `--python_out` specifies the output directory for the Python proto compiler. It generates output files with names ending with `_pb2.py`.
* `--grpc_python_out` specifies the output directory for the gRPC plugin. It generates output files with names ending with `_grpc.py`. **This is the plugin we’re looking for.**
### Using Precompiled gRPC Compiler in Bazel
[rules_python](https://rules-python.readthedocs.io) contains the [py_binary rule](https://rules-python.readthedocs.io/en/latest/api/rules_python/python/private/py_binary_rule.html#py_binary) which makes ￼Python code into executable targets. Here’s a snippet from [Getting Started documentation](https://rules-python.readthedocs.io/en/latest/getting-started.html):
```python
load("@rules_python//python:py_binary.bzl", "py_binary")

py_binary(
  name = "main",
  srcs = ["main.py"],
  deps = [
      "@pypi//foo",
      "@pypi//bar",
  ]
)
```
But what would be the Python code in `main.py` ?
Python’s [runpy](https://docs.python.org/3/library/runpy.html) executes modules similar to `-m` on the command line, allowing me to execute the above Quick Start command containing precompiled gRPC plugin with this:
```python
import runpy

runpy.run_module('grpc_tools.protoc', run_name='__main__')
```
## ✨ Implementation
1. Prepare the executable tool:
   1. Add grpcio-tools Python package from pip. ([Commit](https://github.com/chrisirhc/precompiled-grpc-in-bazel-python/commit/bec9362717eff4b1c7e1d69c6a080aee970ac01a))
   2. Create a `grpcio_tools` target for executing the tool, using the  `py_binary` rule. ([Commit](https://github.com/chrisirhc/precompiled-grpc-in-bazel-python/commit/9d6ad74ca95a56fb382ea77c2390496313da8fe3))
2. Replace the gRPC plugin to use the above created target:
   1. Copy in `python_grpc_compile` definition and get it to work locally. ([Commit](https://github.com/chrisirhc/precompiled-grpc-in-bazel-python/commit/a8475c250f358bd0e9f906f6874ee16e820cca10) ) 
   2. Point `grpc_plugin` into the built-in tool. ([Commit](https://github.com/chrisirhc/precompiled-grpc-in-bazel-python/commit/1b9ca42e15cf47e7cfc2347c2a7d48955086f083))
      This validates whether it's using the right compiled protoc executable. Expect the build to fail since I haven’t changed the actual protoc tool being used. 
   3. Set up a custom `protoc` toolchain that points to the `grpcio_tools` executable created in Step 1.  ([Changes](https://github.com/chrisirhc/precompiled-grpc-in-bazel-python/compare/1b9ca42e15cf47e7cfc2347c2a7d48955086f083...9013beccfb8212d15ca7029d2a45a8afe039af63))
   4. Other changes needed to get protoc to point to our provided executable:
      1. Enable custom proto toolchain resolution ([Commit](https://github.com/chrisirhc/precompiled-grpc-in-bazel-python/commit/2cb60ea81176d4f036f6dfea84ddb5403aa68c09))
      2. Register a proto toolchain_type ([Commit](https://github.com/chrisirhc/precompiled-grpc-in-bazel-python/commit/6f383b38b1da24113e10311aae3572a7a56ce9d5))
## Conclusion
With the above implementation, when `python_grpc_compile` is invoked, a precompiled gRPC plugin is used. No C++ compilation is required.

If you need to set up a new project using the above setup, you can use https://github.com/chrisirhc/precompiled-grpc-in-bazel-python as a starting point.
## Gotchas
The implementation depends on the version of `protoc` distributed with `grpcio-tools` package. The version is defined in the [grpc_deps.bzl file](https://github.com/grpc/grpc/blob/v1.67.0/bazel/grpc_deps.bzl).
## Appendix
* How did I set up the example repository?
  * Use bazel modules, current standard for adding different capabilities into a repo
  * Use the same example proto files from grpc/ and follow their layout.
    * Start from: https://github.com/rules-proto-grpc/rules_proto_grpc/tree/master/examples/python/python_grpc_compile
    * Trace it to https://github.com/rules-proto-grpc/rules_proto_grpc/tree/master/modules
  * Change paths so that the examples work again.
  * Fix weird edge cases with importing newer version bazel deps.
