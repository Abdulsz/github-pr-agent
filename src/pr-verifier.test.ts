import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runDeterministicVerifier } from "./pr-verifier";

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

describe("runDeterministicVerifier", () => {
  it("rejects PR #10-style trivial non-UI firebase edit for dark mode task", () => {
    const result = runDeterministicVerifier(
      "Add dark mode to the home page",
      [{ path: "app/page.js", patch: PR10_PATCH }]
    );
    assert.equal(result.pass, false);
    if (!result.pass) {
      assert.match(result.reason, /trivial|UI-related|imports/i);
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
