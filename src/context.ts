import type { TextDocument, Position } from "vscode";

const MAX_CONTEXT_LINES = 50;
const DEFAULT_MAX_FILE_CONTEXT_CHARS = 3000;

/**
 * Extracts structural context from the document including:
 * - Imports/includes
 * - Class/interface definitions
 * - Function/method signatures
 * - Type definitions
 * - Global variables/constants
 */
export function extractFileContext(
  document: TextDocument,
  cursorPosition: Position,
  maxContextChars: number = DEFAULT_MAX_FILE_CONTEXT_CHARS,
): string {
  const text = document.getText();
  const lines = text.split("\n");
  const cursorLine = cursorPosition.line;

  const contextLines: string[] = [];

  // Always include imports from the beginning of the file
  const importPattern = getImportPattern(document.languageId);
  let inImportBlock = false;

  for (let i = 0; i < lines.length && i < cursorLine; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Skip empty lines at the start
    if (contextLines.length === 0 && trimmedLine === "") {
      continue;
    }

    // Capture imports
    if (importPattern && importPattern.test(trimmedLine)) {
      contextLines.push(line);
      inImportBlock = true;
      continue;
    }

    // Handle multi-line imports (e.g., Python with parentheses)
    if (inImportBlock) {
      contextLines.push(line);
      if (trimmedLine.includes(")") || (!line.endsWith("\\") && !trimmedLine.endsWith(","))) {
        inImportBlock = false;
      }
      continue;
    }

    // Capture structural definitions
    if (isStructuralDefinition(trimmedLine, document.languageId)) {
      // Check if we already have this context
      const lastLine = contextLines[contextLines.length - 1];
      if (lastLine !== line) {
        contextLines.push(line);
      }
    }
  }

  // Also capture recent context lines before cursor (excluding immediate prefix)
  const recentStart = Math.max(0, cursorLine - MAX_CONTEXT_LINES);
  for (let i = recentStart; i < cursorLine; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Skip if already captured as import/definition
    if (contextLines.includes(line)) {
      continue;
    }

    // Include comments and docstrings
    if (
      trimmedLine.startsWith("//") ||
      trimmedLine.startsWith("/*") ||
      trimmedLine.startsWith("*") ||
      trimmedLine.startsWith("#") ||
      trimmedLine.startsWith('"""') ||
      trimmedLine.startsWith("'''")
    ) {
      contextLines.push(line);
      continue;
    }

    // Include function/method bodies if they're significant
    if (isSignificantLine(trimmedLine)) {
      contextLines.push(line);
    }
  }

  // Join context and truncate if too long
  let context = contextLines.join("\n");
  if (context.length > maxContextChars) {
    context = context.substring(context.length - maxContextChars);
    // Try to start at a line boundary
    const firstNewline = context.indexOf("\n");
    if (firstNewline > 0) {
      context = context.substring(firstNewline + 1);
    }
  }

  return context;
}

/**
 * Returns the import pattern for a given language
 */
function getImportPattern(languageId: string): RegExp | null {
  const patterns: Record<string, RegExp> = {
    javascript: /^import\s/,
    typescript: /^import\s/,
    python: /^(import\s|from\s)/,
    java: /^import\s/,
    go: /^(import\s|package\s)/,
    rust: /^(use\s|extern\s|mod\s)/,
    c: /^#include/,
    cpp: /^#include/,
    csharp: /^using\s/,
    php: /^use\s/,
    ruby: /^require/,
  };
  return patterns[languageId] || null;
}

/**
 * Checks if a line is a structural definition
 */
function isStructuralDefinition(line: string, languageId: string): boolean {
  // Common patterns across languages
  const commonPatterns = [
    /^(class|interface|struct|enum|trait|type)\s/,
    /^(public|private|protected|static|async|export|def|fn|func|function)\s/,
    /^(const|let|var|val)\s+\w+\s*[:=]/,
    /^\w+\s*[=:]\s*(function|=>|\()/,
    /^[\s]*@(Component|Service|Controller|Module|Injectable|Entity|Repository)/, // Decorators
    /^[\s]*(async\s+)?(function|def|fn|func)\s+\w+/, // Function definitions
  ];

  const languageSpecificPatterns: Record<string, RegExp[]> = {
    python: [
      /^(class|def)\s/,
      /^\s+def\s+\w+\s*\(/, // Indented method definitions
      /^\w+\s*:\s*(str|int|float|bool|list|dict|tuple|Any|Optional|Union)\s*=/, // Type-annotated variables
    ],
    typescript: [
      /^(export\s+)?(type|interface|class|enum|function|const|let|var)\s+\w+/,
      /^(export\s+)?default\s+/,
    ],
    javascript: [
      /^(export\s+)?(class|function|const|let|var)\s+\w+/,
      /^(module\.)?exports\./,
    ],
    java: [
      /^(public|private|protected|static|final|abstract)?\s*(class|interface|enum|void|int|String|boolean|double|float|long|short|byte)\s+\w+/,
    ],
    go: [
      /^(func|type|var|const)\s/,
      /^package\s/,
    ],
    rust: [
      /^(fn|struct|enum|trait|impl|type|const|static|pub)\s/,
    ],
    ruby: [
      /^(class|module|def)\s/,
    ],
  };

  const patterns = [
    ...commonPatterns,
    ...(languageSpecificPatterns[languageId] || []),
  ];

  return patterns.some((pattern) => pattern.test(line));
}

/**
 * Checks if a line is significant enough to include in context
 */
function isSignificantLine(line: string): boolean {
  if (line.length === 0) return false;
  if (line.length < 3) return false;

  // Skip purely structural lines
  if (/^[{}\[\]()]$/.test(line.trim())) return false;

  // Include lines with actual content
  const trimmed = line.trim();
  if (trimmed.length < 2) return false;

  return true;
}

/**
 * Formats the file context for inclusion in the FIM prompt
 */
export function formatFileContext(
  context: string,
  fileName: string,
  languageId: string,
): string {
  if (!context || context.trim().length === 0) {
    return "";
  }

  const ext = fileName.split(".").pop() || languageId;
  return `<|file_context|>File: ${fileName}\n\`\`\`${ext}\n${context}\n\`\`\`<|end_file_context|>\n\n`;
}

/**
 * Extracts the current scope/context (e.g., inside which function/class we are)
 */
export function extractCurrentScope(
  document: TextDocument,
  position: Position,
): string {
  const lines = document.getText().split("\n");
  const cursorLine = position.line;

  interface ScopeInfo {
    type: string;
    name: string;
    line: number;
    indentation: number;
  }

  const scopeStack: ScopeInfo[] = [];

  for (let i = 0; i < cursorLine; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const indentation = line.length - line.trimStart().length;

    // Check for scope entries
    const scopeEntry = matchScopeEntry(trimmed, document.languageId);
    if (scopeEntry) {
      // Pop scopes that are at same or greater indentation (Python-style)
      while (
        scopeStack.length > 0 &&
        scopeStack[scopeStack.length - 1].indentation >= indentation
      ) {
        scopeStack.pop();
      }
      scopeStack.push({ ...scopeEntry, line: i, indentation });
    }

    // Check for scope exits (simplified - just based on braces for C-style languages)
    if (["javascript", "typescript", "java", "c", "cpp", "csharp", "go"].includes(document.languageId)) {
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      const netBraces = openBraces - closeBraces;

      if (netBraces < 0) {
        for (let j = 0; j < Math.abs(netBraces); j++) {
          if (scopeStack.length > 0) {
            scopeStack.pop();
          }
        }
      }
    }
  }

  if (scopeStack.length === 0) {
    return "";
  }

  return scopeStack
    .map((s) => `${s.type} ${s.name}`)
    .join(" > ");
}

function matchScopeEntry(
  line: string,
  languageId: string,
): { type: string; name: string } | null {
  const patterns: { pattern: RegExp; type: string }[] = [
    { pattern: /class\s+(\w+)/, type: "class" },
    { pattern: /interface\s+(\w+)/, type: "interface" },
    { pattern: /struct\s+(\w+)/, type: "struct" },
    { pattern: /enum\s+(\w+)/, type: "enum" },
    { pattern: /trait\s+(\w+)/, type: "trait" },
    { pattern: /module\s+(\w+)/, type: "module" },
    { pattern: /def\s+(\w+)\s*\(/, type: "function" },
    { pattern: /fn\s+(\w+)\s*\(/, type: "function" },
    { pattern: /func\s+(\w+)\s*\(/, type: "function" },
    { pattern: /function\s+(\w+)\s*\(/, type: "function" },
    { pattern: /(\w+)\s*:\s*function\s*\(/, type: "method" },
    { pattern: /(\w+)\s*[=:]\s*\([^)]*\)\s*=>/, type: "function" },
  ];

  for (const { pattern, type } of patterns) {
    const match = line.match(pattern);
    if (match) {
      return { type, name: match[1] };
    }
  }

  return null;
}
