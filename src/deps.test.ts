import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

/**
 * Runner chạy trên EC2 với `npm ci --omit=dev`. Import một package không khai
 * trong dependencies thì trên máy này vẫn chạy (nó nằm trong node_modules từ
 * chỗ khác) nhưng trên Runner sẽ ném — và nếu chỗ ném đó lại nằm trong khối
 * dọn dẹp thì máy không tắt, đốt tiền im lặng.
 *
 * Lỗi này đã xảy ra hai lần. Test này để không có lần thứ ba.
 */
test("mọi @aws-sdk được import đều khai trong dependencies", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    dependencies: Record<string, string>;
  };
  const declared = new Set(Object.keys(pkg.dependencies ?? {}));

  const imported = new Set<string>();
  for (const f of readdirSync("src")) {
    if (!f.endsWith(".ts") || f.endsWith(".test.ts")) continue;
    const src = readFileSync(`src/${f}`, "utf8");
    for (const m of src.matchAll(/["'](@aws-sdk\/[a-z0-9-]+)["']/g))
      imported.add(m[1]);
  }

  const missing = [...imported].filter((p) => !declared.has(p));
  assert.deepEqual(missing, [], `thiếu trong dependencies: ${missing.join(", ")}`);
});

test("runtime-only deps không được nằm trong devDependencies", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const dev = Object.keys(pkg.devDependencies ?? {});
  // `npm ci --omit=dev` trên Runner sẽ bỏ qua devDependencies.
  assert.deepEqual(
    dev.filter((d) => d.startsWith("@aws-sdk/") || d === "playwright"),
    [],
  );
});
