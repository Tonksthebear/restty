const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const root_mod = b.createModule(.{
        .root_source_file = b.path("main.zig"),
        .target = target,
        .optimize = optimize,
    });

    const ghostty_dep = b.dependency("ghostty", .{
        .target = target,
        .optimize = optimize,
        .simd = false,
    });
    root_mod.addImport("ghostty-vt", ghostty_dep.module("ghostty-vt"));

    const exe = b.addExecutable(.{
        .name = "ghostsnp-fixture-gen",
        .root_module = root_mod,
    });
    b.installArtifact(exe);

    const run = b.addRunArtifact(exe);
    if (b.args) |args| {
        run.addArgs(args);
    }
    const run_step = b.step("run", "Generate committed GHOSTSNP conformance fixtures");
    run_step.dependOn(&run.step);
}
