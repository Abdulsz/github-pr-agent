import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findUndeclaredImports, runDeterministicVerifier } from "./pr-verifier";

const PR10_PATCH = `@@ -24,7 +24,7 @@ import {
 import Webcam from "react-webcam";
 
-// Initialize Firebase storage
+const storage = getStorage();
 //const storage = getStorage();
 
 export default function Home() {`;

const DARK_MODE_PATCH = `@@ -145,7 +145,7 @@ export default function Home() {
   return (
-    <Box>
+    <Box sx={{ bgcolor: '#121212', color: '#fff', minHeight: '100vh' }}>
       <Typography variant="h4">Pantry</Typography>`;

// Whitespace-only reindent of UI lines (the real PR #12 no-op diff).
const WHITESPACE_ONLY_PATCH = `@@ -10,9 +10,9 @@ export const metadata = {
 export default function RootLayout({ children }) {
-  return (
-    <html lang="en">
-      <body className={inter.className}>{children}</body>
-    </html>
-  );
-}
+ return (
+ <html lang="en">
+ <body className={inter.className}>{children}</body>
+ </html>
+ );
+}`;

// UI markers appear only in unchanged context lines; the actual edit is a comment.
const CONTEXT_ONLY_UI_PATCH = `@@ -143,5 +143,5 @@ export default function Home() {
   return (
     <Box>
-      {/* old note */}
+      {/* new note */}
     </Box>`;

// The actual PR #14 diff: the model re-inserted a partial, broken copy of the
// JSX block that already exists immediately below (duplicate + malformed style).
const PR14_DUPLICATE_BROKEN_PATCH = `@@ -143,6 +143,11 @@ export default function Home() {
   );
 
   return (
+ <Box>
+ <Container width="100%" height="350px" position="relative">
+ <img
+ src="https://firebasestorage.googleapis.com/v0/b/fooddelivery-6176f.appspot.com/o/inventory%2Fnew%20tomatos.jpg?alt=media&token=df7c6654-3ae9-42df-8278-fd87f9765c4a"
+ style={{}
     <Box>
       <Container width="100%" height="350px" position="relative">
         <img`;

// Run 1 (branch ...190842): added a createTheme with mode 'light' — not dark.
const LIGHT_MODE_THEME_PATCH = `@@ -27,6 +29,27 @@ import Webcam from "react-webcam";
 // Initialize Firebase storage
 //const storage = getStorage();
 
+const theme = createTheme({
+  palette: {
+    mode: 'light',
+    primary: {
+      main: '#DD5349',
+    },
+    background: {
+      default: '#fff',
+      paper: '#fff',
+    },
+    text: {
+      primary: '#000',
+      secondary: '#333',
+    },
+  },
+});
+
 export default function Home() {`;

// Run 2 (branch ...191156): theme created with a dark toggle but never applied
// (no <ThemeProvider> wraps the UI).
const THEME_NOT_APPLIED_PATCH = `@@ -38,6 +41,16 @@ export default function Home() {
   const [uploading, setUploading] = useState(false);
+  const [darkMode, setDarkMode] = useState(false);
+
+  const theme = createTheme({
+    palette: {
+      mode: darkMode ? 'dark' : 'light',
+      primary: {
+        main: '#DD5349',
+      },
+    },
+  });`;

describe("findUndeclaredImports", () => {
  const DEPS = ["@mui/material", "firebase", "next", "react", "react-dom"];

  it("flags an added import from a package missing in package.json (the PR #17 case)", () => {
    const patch = `@@ -11,6 +11,8 @@ import {
   Container,
 } from "@mui/material";
+import ClearIcon from "@mui/icons-material/Clear";`;
    const result = findUndeclaredImports([{ path: "app/page.js", patch }], DEPS);
    assert.ok(result);
    assert.match(result!, /@mui\/icons-material/);
  });

  it("allows declared packages, their subpaths, path aliases, and relative imports", () => {
    const patch = `@@ -1,3 +1,7 @@
+import { getDoc } from "firebase/firestore";
+import { Box } from "@mui/material";
+import { helper } from "@/lib/helper";
+import local from "./local";`;
    assert.equal(findUndeclaredImports([{ path: "app/page.js", patch }], DEPS), null);
  });

  it("skips the check when no dependency list is available", () => {
    const patch = `+import X from "not-installed";`;
    assert.equal(findUndeclaredImports([{ path: "app/page.js", patch }], undefined), null);
  });

  it("is exposed through runDeterministicVerifier", () => {
    const patch = `@@ -145,7 +145,8 @@ export default function Home() {
   return (
-    <Box>
+    <Box sx={{ bgcolor: '#121212' }}>
+      <ClearIcon />
@@ -11,6 +11,7 @@ import {
+import ClearIcon from "@mui/icons-material/Clear";`;
    const result = runDeterministicVerifier(
      "Add dark mode to the home page",
      [{ path: "app/page.js", patch }],
      DEPS
    );
    assert.equal(result.pass, false);
    if (!result.pass) {
      assert.match(result.reason, /@mui\/icons-material/);
    }
  });
});

describe("runDeterministicVerifier", () => {
  it("rejects PR #10-style trivial non-UI firebase edit for dark mode task", () => {
    const result = runDeterministicVerifier(
      "Add dark mode to the home page",
      [{ path: "app/page.js", patch: PR10_PATCH }]
    );
    assert.equal(result.pass, false);
    if (!result.pass) {
      assert.match(result.reason, /trivial|UI-related|imports|no dark styling/i);
    }
  });

  it("passes plausible dark mode UI patch", () => {
    const result = runDeterministicVerifier(
      "Add dark mode to the home page",
      [{ path: "app/page.js", patch: DARK_MODE_PATCH }]
    );
    assert.equal(result.pass, true);
  });

  it("rejects empty diffs", () => {
    const result = runDeterministicVerifier("Fix bug", []);
    assert.equal(result.pass, false);
  });

  it("rejects whitespace-only reindent that touches UI lines", () => {
    const result = runDeterministicVerifier(
      "Add dark mode to the home page",
      [{ path: "app/layout.js", patch: WHITESPACE_ONLY_PATCH }]
    );
    assert.equal(result.pass, false);
    if (!result.pass) {
      assert.match(result.reason, /reformat|whitespace|indentation/i);
    }
  });

  it("rejects UI task whose markers are only in context lines", () => {
    const result = runDeterministicVerifier(
      "Add dark mode to the home page",
      [{ path: "app/page.js", patch: CONTEXT_ONLY_UI_PATCH }]
    );
    assert.equal(result.pass, false);
  });

  it("rejects the PR #14 duplicate/broken JSX insertion", () => {
    const result = runDeterministicVerifier(
      "Add dark mode to the home page",
      [{ path: "app/page.js", patch: PR14_DUPLICATE_BROKEN_PATCH }]
    );
    assert.equal(result.pass, false);
    if (!result.pass) {
      assert.match(result.reason, /duplicate|malformed|broken|truncated/i);
    }
  });

  it("rejects a dark mode task whose theme palette is set to 'light'", () => {
    const result = runDeterministicVerifier(
      "Add dark mode to the home page",
      [{ path: "app/page.js", patch: LIGHT_MODE_THEME_PATCH }]
    );
    assert.equal(result.pass, false);
    if (!result.pass) {
      assert.match(result.reason, /light|dark theme/i);
    }
  });

  it("rejects a dark theme that is defined but never applied via ThemeProvider", () => {
    const result = runDeterministicVerifier(
      "Add dark mode to the home page",
      [{ path: "app/page.js", patch: THEME_NOT_APPLIED_PATCH }]
    );
    assert.equal(result.pass, false);
    if (!result.pass) {
      assert.match(result.reason, /never applies|ThemeProvider/i);
    }
  });

  it("passes a dark theme that is applied via ThemeProvider", () => {
    const patch = `@@ -145,7 +145,9 @@ export default function Home() {
   return (
-    <Box>
+    <ThemeProvider theme={createTheme({ palette: { mode: 'dark' } })}>
+    <Box sx={{ bgcolor: 'background.default' }}>
       <Typography variant="h4">Pantry</Typography>`;
    const result = runDeterministicVerifier(
      "Add dark mode to the home page",
      [{ path: "app/page.js", patch }]
    );
    assert.equal(result.pass, true);
  });

  it("rejects state + toggle handler with JSX untouched (the half-wired live-run shape)", () => {
    const patch = `@@ -38,6 +41,8 @@ export default function Home() {
   const [uploading, setUploading] = useState(false);
+  const [darkMode, setDarkMode] = useState(false);
+
+  const handleDarkModeToggle = () => setDarkMode((prev) => !prev);`;
    const result = runDeterministicVerifier(
      "Add dark mode to the home page",
      [{ path: "app/page.js", patch }]
    );
    assert.equal(result.pass, false);
    if (!result.pass) {
      assert.match(result.reason, /never applies|no visible effect/i);
    }
  });

  it("passes dark styling applied directly via sx with a darkMode state (no ThemeProvider)", () => {
    const patch = `@@ -38,6 +41,7 @@ export default function Home() {
   const [uploading, setUploading] = useState(false);
+  const [darkMode, setDarkMode] = useState(true);
@@ -145,7 +149,7 @@ export default function Home() {
   return (
-    <Box>
+    <Box sx={{ bgcolor: darkMode ? '#121212' : '#fff', color: darkMode ? '#fff' : '#000', minHeight: '100vh' }}>
       <Typography variant="h4">Pantry</Typography>`;
    const result = runDeterministicVerifier(
      "Add dark mode to the home page",
      [{ path: "app/page.js", patch }]
    );
    assert.equal(result.pass, true, JSON.stringify(result));
  });

  it("rejects a dark-mode task whose added lines contain no dark styling at all", () => {
    const patch = `@@ -145,7 +145,7 @@ export default function Home() {
   return (
-    <Box>
+    <Box sx={{ padding: 2 }}>
       <Typography variant="h4">Pantry</Typography>`;
    const result = runDeterministicVerifier(
      "Add dark mode to the home page",
      [{ path: "app/page.js", patch }]
    );
    assert.equal(result.pass, false);
    if (!result.pass) {
      assert.match(result.reason, /no dark styling/i);
    }
  });

  it("rejects unwired appearance state on a non-dark UI task", () => {
    const patch = `@@ -38,6 +41,7 @@ export default function Home() {
   const [uploading, setUploading] = useState(false);
+  const [bgColor, setBgColor] = useState('#ffffff');`;
    const result = runDeterministicVerifier(
      "Change the page background color",
      [{ path: "app/page.js", patch }]
    );
    assert.equal(result.pass, false);
    if (!result.pass) {
      assert.match(result.reason, /never uses it|no visible effect/i);
    }
  });

  it("rejects getStorage without import", () => {
    const result = runDeterministicVerifier(
      "Update storage",
      [
        {
          path: "app/page.js",
          patch: "+const storage = getStorage();\n",
        },
      ]
    );
    assert.equal(result.pass, false);
    if (!result.pass) {
      assert.match(result.reason, /getStorage/i);
    }
  });
});
