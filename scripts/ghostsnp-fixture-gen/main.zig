//! Host-side (native) GHOSTSNP fixture generator for Restty conformance.
//!
//! Uses the pinned Ghostty encode path — not freestanding WASM export.
//! Output is written under tests/fixtures/ghostsnp/ for A8 gates.
//!
//! Build/run (from this directory, after apply-ghostty-patch):
//!   zig build run -- ../../tests/fixtures/ghostsnp

const std = @import("std");
const ghostty = @import("ghostty-vt");

pub const std_options: std.Options = ghostty.std_options;

const Allocator = std.mem.Allocator;

fn resttyIo() std.Io {
    return std.Io.Threaded.global_single_threaded.io();
}

fn writeFixture(io: std.Io, alloc: Allocator, out_dir: []const u8, name: []const u8, bytes: []const u8) !void {
    const path = try std.fs.path.join(alloc, &.{ out_dir, name });
    defer alloc.free(path);
    try std.Io.Dir.cwd().writeFile(io, .{ .sub_path = path, .data = bytes });
    std.debug.print("wrote {s} ({d} bytes)\n", .{ path, bytes.len });
}

fn encodeTerminal(alloc: Allocator, term: *ghostty.Terminal, continuation: ghostty.snapshot.Continuation) ![]u8 {
    var output: std.Io.Writer.Allocating = .init(alloc);
    errdefer output.deinit();
    try ghostty.snapshot.encode(alloc, &output.writer, term, .{
        .continuation = continuation,
    });
    return try output.toOwnedSlice();
}

fn feed(stream: *ghostty.TerminalStream, bytes: []const u8) void {
    stream.nextSlice(bytes);
}

/// Rich matrix fixture: scrollback, SGR attrs, colors, cursor, kitty kb, mouse.
fn buildRichMatrix(alloc: Allocator) ![]u8 {
    var term = try ghostty.Terminal.init(resttyIo(), alloc, .{
        .cols = 40,
        .rows = 12,
        .max_scrollback_bytes = 2_000_000,
    });
    defer term.deinit(alloc);

    var stream = ghostty.TerminalStream.init(.{
        .allocator = alloc,
        .handler = .init(&term),
        .continuation_max_bytes = 1024,
    });
    defer stream.deinit();

    // Scrollback beyond the 12-row viewport: unique line markers.
    var line_buf: [64]u8 = undefined;
    var i: usize = 0;
    while (i < 40) : (i += 1) {
        const line = try std.fmt.bufPrint(&line_buf, "SCROLLBACK-LINE-{d:0>3}\r\n", .{i});
        feed(&stream, line);
    }

    // OSC palette tweak (index 1 → distinctive) before drawing colored text.
    feed(&stream, "\x1b]4;1;rgb:ab/cd/ef\x07");

    // Visible content with cell attributes and colors on a clean line.
    // Layout (0-based after scrollback settles): one dedicated attrs line.
    feed(&stream, "\x1b[1mBOLD\x1b[0m \x1b[4mUNDER\x1b[0m ");
    feed(&stream, "\x1b[31mRED\x1b[0m \x1b[32mGREEN\x1b[0m\r\n");
    feed(&stream, "PALETTE-PROBE\r\n");
    feed(&stream, "GHOSTSNP-RICH-MATRIX\r\n");

    // Kitty keyboard progressive enhancement flags (disambiguate).
    feed(&stream, "\x1b[=1u");

    // Mouse tracking: normal + SGR.
    feed(&stream, "\x1b[?1000;1006h");

    // Final encoded cursor: CUP to row 8 col 5 (1-based), then leave idle.
    // Tests assert this exact restored cursor after import.
    feed(&stream, "\x1b[8;5H");

    return try encodeTerminal(alloc, &term, .ground);
}

pub fn main(init: std.process.Init) !void {
    const alloc = init.gpa;
    const io = init.io;

    var args = try std.process.Args.Iterator.initAllocator(init.minimal.args, alloc);
    defer args.deinit();
    _ = args.next(); // argv0
    const out_dir = args.next() orelse {
        std.debug.print("usage: ghostsnp-fixture-gen <out-dir>\n", .{});
        std.process.exit(2);
    };

    try std.Io.Dir.cwd().createDirPath(io, out_dir);

    const rich = try buildRichMatrix(alloc);
    defer alloc.free(rich);
    if (rich.len < 8 or !std.mem.eql(u8, rich[0..8], "GHOSTSNP")) {
        std.debug.print("encode failed magic check\n", .{});
        std.process.exit(1);
    }
    try writeFixture(io, alloc, out_dir, "rich-matrix-v1.bin", rich);
}
