---
layout: ../layouts/BlogPost.astro
title: Using a precompiled gRPC compiler in Bazel for Python
slug: precompiled-grpc-compiler-bazel-python
description: How to use a precompiled gRPC compiler for Python in Bazel
tags:
  - technical
added: 2024-11-25T16:56:48.487Z
---
# Using a precompiled gRPC plugin in Bazel monorepo for Python
Reference repository: https://github.com/chrisirhc/precompiled-grpc-in-bazel-python
## Who is this written for?
* Those who are curious what Developer Tools and Developer Platform Engineering teams work on.
* Get a peek into what working with Bazel on a monorepo is like.
* how does adding some customizations on open source rulesets look like on Bazel
* Goes into customizing some rules without much depth into the rules themselves. It's a bit of learn by practicing by example.

Expects:
* some understanding of tools apply actions on code
* you don't have to know what protobuf or grpc are, except that they are tools that generate code in multiple programming languages including Python.

## Quick bit on Protocol Buffers (protobuf) and gRPC
[Protocol buffers \(protobuf\)](https://protobuf.dev/) is a data serialization format like JSON. One uses protobuf by writing files with the .proto extension to describe the schema of the data they are serializing. Protobuf works across multiple programming languages including Python, Java, etc. It has a code generator (protoc) that generates language-specific code from .proto files so that applications or services can serialize and deserialize data in the specified schema. Read more about it [here](https://protobuf.dev/).
[gRPC](https://grpc.io) is a Remote Procedure Call (RPC) interface built on top of protobuf format. An over-simplistic analogy is to relate how [tRPC](https://trpc.io/docs/rpc)/REST is to JSON is similar to how gRPC is to protobuf.
## 🎬 Starting State 
### Python monorepo managed by Bazel (aka “the monorepo”)
A number of [Python](https://www.python.org) services and libraries are in a monorepo managed by [Bazel](https://bazel.build). Some services and libraries use protobuf, so the monorepo contains .proto files. The monorepo uses [rules_proto](https://github.com/bazelbuild/rules_proto) and [rules_proto_grpc](https://rules-proto-grpc.com/) rules to execute the protoc tool along with a gRPC plugin to compile .proto files into Python protobuf and gRPC code for interacting with protobuf and gRPC endpoints.
### Users reported that building locally on Mac fails
Due to [a Mac build issue](https://github.com/uber/hermetic_cc_toolchain/issues/10#issuecomment-1653731027) on hermetic cc toolchain, compiling protoc on Mac fails. This breaks local development on Mac.
## 🎯 Goal State
* Building on Mac should just work™️
* Even better: one shouldn’t need to wait for any C++ compilation on a supported set of platforms.
## 🕵️‍♀️ Investigation
### Read the rule definition
The problematic targets look like these [here in the example repo](https://github.com/chrisirhc/precompiled-grpc-in-bazel-python/blob/d2fe4a589614893bbcc5825aa259cb295abfdfa4/BUILD.bazel) :
```python
load("@rules_proto_grpc_python//:defs.bzl", "python_grpc_compile")

python_grpc_compile(
    name = "thing_python_grpc",
    protos = ["@rules_proto_grpc_example_protos//:thing_proto"],
)
```

Digging further into the [python_grpc_compile](https://github.com/rules-proto-grpc/rules_proto_grpc/blob/d17b5b16c8b12143c6f1b78dabd6bbc228e89b58/modules/python/python_grpc_compile.bzl) rule definition, it depends on proto_plugin and grpc_plugin:
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

Inspecting the targets proto_plugin and grpc_plugin in the [BUILD.bazel](https://github.com/rules-proto-grpc/rules_proto_grpc/blob/d17b5b16c8b12143c6f1b78dabd6bbc228e89b58/modules/python/BUILD.bazel):
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
proto_plugin uses the default builtin protoc. This can be replaced with a precompiled tool via toolchains_protoc. This is now the default behavior in rules_python (citation).

However, [gRPC plugin](https://github.com/rules-proto-grpc/rules_proto_grpc/blob/d17b5b16c8b12143c6f1b78dabd6bbc228e89b58/modules/python/BUILD.bazel#L34) points to a target, [grpc_python_plugin](https://github.com/grpc/grpc/blob/fe8bd94c924f98ae4292ec8dfc969dbd802ec886/src/compiler/BUILD#L120), that points to a C++ source file (`python_plugin.cc`) needs to be compiled from C++:
```python
grpc_proto_plugin(
    name = "grpc_python_plugin",
    srcs = ["python_plugin.cc"],
    deps = [":grpc_plugin_support"],
)
```
### Find similar reports/requests
I found a number of comments and issues that indicate that the issue exists, and that I’m not missing an obvious solution. Here’s what I found:
* Request for rules_proto_grpc to use a precompiled protoc executable ([rules_proto_grpc\#88](https://github.com/rules-proto-grpc/rules_proto_grpc/issues/88))
* [Comment in toolchains_protoc](￼) indicating that usages of grpc plugin require C++ compilation
* Request for a precompiled gRPC plugin ([gprc\#38078](https://github.com/grpc/grpc/issues/38078))
### Look for precompiled gRPC plugin
Even though there’s no straightforward solution, I recall that the gRPC documentation mentions a quick way to use the gRPC plugin.
* Found [gRPC’s Python Quick start](https://grpc.io/docs/languages/python/quickstart/ "https://grpc.io/docs/languages/python/quickstart/")  
* It can be [executed like protoc](https://pypi.org/project/grpcio-tools/#:~:text=Usage), supporting the same arguments.
* It comes with a [built-in gRPC plug-in](https://pypi.org/project/grpcio-tools/#:~:text=INCLUDE%20%2D%2Dpython_out=$OUTPUT%20%2D%2D-,grpc_python_out,-=$OUTPUT%20$PROTO_FILES).

Here’s the snippet from the [gRPC’s Python Quick Start](https://grpc.io/docs/languages/python/quickstart/) mentioning [grpcio-tools package](https://pypi.org/project/grpcio-tools/):
```bash
$ python -m grpc_tools.protoc -I$INCLUDE --python_out=$OUTPUT --grpc_python_out=$OUTPUT $PROTO_FILES
```
Note how the arguments match those in of protoc per the [Protobuf Python Generated Code Documentation](https://protobuf.dev/reference/python/python-generated/#invocation) :
* `-I` specifies the directory to look for .proto files used in imports.
* `--python_out` specifies the output directory for the Python proto compiler. It generates output files with names ending with `_pb2.py`.
* `--grpc_python_out` specifies the output directory for the gRPC plugin. It generates output files with names ending with `_grpc.py`. **This is the plugin we’re looking for.**
### Figure out how to run the precompiled gRPC compiler via Bazel
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
Python’s [runpy](￼) executes modules similar to `-m` on the command line, allowing me to execute the above Quick Start command containing precompiled gRPC plugin with this:
```python
import runpy

runpy.run_module('grpc_tools.protoc', run_name='__main__')
```
## ✨ Implementation
1. Prepare the executable tool.
   * Tools have their arguments as an input API. As long as the input arguments are compatible, we can swap out the tool. I checked that grpcio-tools offers the protoc compatible tool, since it is actually protoc but with a built-in grpc plugin.
   1. Add grpcio-tools Python package from pip. ([Commit](https://github.com/chrisirhc/precompiled-grpc-in-bazel-python/commit/bec9362717eff4b1c7e1d69c6a080aee970ac01a))
   2. Make sure we can run it from py_binary as a tool. ([Commit](https://github.com/chrisirhc/precompiled-grpc-in-bazel-python/commit/9d6ad74ca95a56fb382ea77c2390496313da8fe3))
2. Replace the tool used for the grpc compilation.
   1. Copy in python_grpc_compile definition and get it to work locally. ([Commit](https://github.com/chrisirhc/precompiled-grpc-in-bazel-python/commit/a8475c250f358bd0e9f906f6874ee16e820cca10) ) 
   2. Point grpc_plugin into a built-in tool, to validate whether it's using the right compiled protoc executable. Expect the build to fail since I haven’t changed the actual protoc tool being used. ([Commit](https://github.com/chrisirhc/precompiled-grpc-in-bazel-python/commit/1b9ca42e15cf47e7cfc2347c2a7d48955086f083))
   3. Create a new protoc toolchain that points to the grpcio_tools executable created in Step 1.  ([Changes](https://github.com/chrisirhc/precompiled-grpc-in-bazel-python/compare/1b9ca42e15cf47e7cfc2347c2a7d48955086f083...9013beccfb8212d15ca7029d2a45a8afe039af63))
   4. Other changes needed to get protoc to point to our provided executable.
      1. Enable custom proto toolchain resolution ([Commit](https://github.com/chrisirhc/precompiled-grpc-in-bazel-python/commit/2cb60ea81176d4f036f6dfea84ddb5403aa68c09))
      2. Register a proto toolchain_type ([Commit](https://github.com/chrisirhc/precompiled-grpc-in-bazel-python/commit/6f383b38b1da24113e10311aae3572a7a56ce9d5))
## Gotchas
Note that this implementation ties the protoc version to what’s distributed in the grpcio-tools package, where the proto compiler version is defined in the [grpc_deps.bzl file](https://github.com/grpc/grpc/blob/v1.67.0/bazel/grpc_deps.bzl).

## Appendix
* How did I set up the example repository?
  * Use bazel modules, current standard for adding different capabilities into a repo
  * Use the same example proto files from grpc/ and follow their layout.
    * Start from: https://github.com/rules-proto-grpc/rules_proto_grpc/tree/master/examples/python/python_grpc_compile
    * Trace it to https://github.com/rules-proto-grpc/rules_proto_grpc/tree/master/modules
  * Change paths so that the examples work again.
  * Fix weird edge cases with importing newer version bazel deps.
