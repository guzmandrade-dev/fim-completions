import { describe, expect, it } from "vitest";
import {
  extractFileContext,
  formatFileContext,
  extractCurrentScope,
} from "./context.js";
import type { TextDocument, Position } from "vscode";

function createMockDocument(
  content: string,
  languageId: string,
  fileName: string,
): TextDocument {
  const lines = content.split("\n");

  return {
    getText: () => content,
    languageId,
    fileName,
    lineCount: lines.length,
    offsetAt: (pos: Position) => {
      let offset = 0;
      for (let i = 0; i < pos.line && i < lines.length; i++) {
        offset += lines[i].length + 1;
      }
      return offset + pos.character;
    },
    positionAt: (offset: number) => {
      let line = 0;
      let char = offset;
      for (let i = 0; i < lines.length; i++) {
        if (char <= lines[i].length) {
          line = i;
          break;
        }
        char -= lines[i].length + 1;
      }
      return { line, character: char };
    },
  } as TextDocument;
}

describe("extractFileContext", () => {
  it("extracts imports from TypeScript file", () => {
    const code = `import React from "react";
import { useState, useEffect } from "react";
import { fetchData } from "./api";

function Component() {
  const [data, setData] = useState(null);
  
  // cursor here
}`;

    const doc = createMockDocument(code, "typescript", "Component.tsx");
    const context = extractFileContext(doc, { line: 7, character: 14 } as Position);

    expect(context).toContain('import React from "react"');
    expect(context).toContain("import { useState, useEffect }");
    expect(context).toContain("import { fetchData }");
    expect(context).toContain("function Component()");
    expect(context).toContain("const [data, setData]");
  });

  it("extracts imports from Python file", () => {
    const code = `import os
import sys
from typing import List, Optional
from mymodule import utils

def process_data(items: List[str]) -> Optional[str]:
    result = []
    
    # cursor here
    pass`;

    const doc = createMockDocument(code, "python", "process.py");
    const context = extractFileContext(doc, { line: 8, character: 8 } as Position);

    expect(context).toContain("import os");
    expect(context).toContain("import sys");
    expect(context).toContain("from typing import");
    expect(context).toContain("from mymodule import");
    expect(context).toContain("def process_data");
  });

  it("extracts class and function definitions", () => {
    const code = `import { Component } from "react";

interface Props {
  name: string;
}

class MyComponent extends Component<Props> {
  private value: number = 0;
  
  render() {
    return 
  }
}`;

    const doc = createMockDocument(code, "typescript", "MyComponent.tsx");
    const context = extractFileContext(doc, { line: 9, character: 11 } as Position);

    expect(context).toContain("import { Component }");
    expect(context).toContain("interface Props");
    expect(context).toContain("class MyComponent");
    expect(context).toContain("private value");
  });

  it("respects max context chars limit", () => {
    const code = `import os
${"// Some comment line\n".repeat(100)}
const x = 1;

// cursor`;

    const doc = createMockDocument(code, "javascript", "test.js");
    const context = extractFileContext(
      doc,
      { line: 102, character: 8 } as Position,
      500,
    );

    expect(context.length).toBeLessThanOrEqual(500);
  });

  it("handles files without imports", () => {
    const code = `const greeting = "hello";

function sayHello() {
  console.log(greeting);
}

// cursor`;

    const doc = createMockDocument(code, "javascript", "greeting.js");
    const context = extractFileContext(doc, { line: 6, character: 8 } as Position);

    expect(context).toContain("const greeting");
    expect(context).toContain("function sayHello()");
  });

  it("captures comments and docstrings", () => {
    const code = `/**
 * This is a module for data processing
 */

// Helper function
function helper() {}

/* cursor */`;

    const doc = createMockDocument(code, "javascript", "helper.js");
    const context = extractFileContext(doc, { line: 7, character: 10 } as Position);

    expect(context).toContain("This is a module");
    expect(context).toContain("Helper function");
  });
});

describe("formatFileContext", () => {
  it("formats context with file markers", () => {
    const context = "import os\nimport sys";
    const result = formatFileContext(context, "test.py", "python");

    expect(result).toContain("<|file_context|>");
    expect(result).toContain("File: test.py");
    expect(result).toContain("import os");
    expect(result).toContain("import sys");
    expect(result).toContain("<|end_file_context|>");
    expect(result).toContain("```python");
  });

  it("returns empty string for empty context", () => {
    const result = formatFileContext("", "test.ts", "typescript");
    expect(result).toBe("");
  });

  it("uses languageId as fallback for extension", () => {
    const context = "const x = 1;";
    const result = formatFileContext(context, "file.unknown", "javascript");

    expect(result).toContain("```javascript");
  });
});

describe("extractCurrentScope", () => {
  it("identifies current function scope in TypeScript", () => {
    const code = `function outer() {
  const x = 1;
  
  function inner() {
    return x;
  }
  
  // cursor here
}`;

    const doc = createMockDocument(code, "typescript", "scope.ts");
    const scope = extractCurrentScope(doc, { line: 7, character: 14 } as Position);

    expect(scope).toContain("function outer");
  });

  it("identifies nested scope in Python", () => {
    const code = `class MyClass:
    def __init__(self):
        self.value = 0
    
    def method(self):
        def inner():
            pass
        
        # cursor here
        pass`;

    const doc = createMockDocument(code, "python", "scope.py");
    const scope = extractCurrentScope(doc, { line: 8, character: 16 } as Position);

    expect(scope).toContain("class MyClass");
    expect(scope).toContain("def method");
  });

  it("handles C-style languages with braces", () => {
    const code = `class Container {
  public:
    void method() {
      int x = 0;
      // cursor
    }
};`;

    const doc = createMockDocument(code, "cpp", "scope.cpp");
    const scope = extractCurrentScope(doc, { line: 4, character: 14 } as Position);

    expect(scope).toContain("class Container");
    expect(scope).toContain("method method");
  });

  it("returns empty string when no scope found", () => {
    const code = `const x = 1;
// cursor`;

    const doc = createMockDocument(code, "javascript", "top.js");
    const scope = extractCurrentScope(doc, { line: 1, character: 8 } as Position);

    expect(scope).toBe("");
  });

  it("identifies class scope", () => {
    const code = `class MyClass {
  constructor() {
    this.value = 0;
  }
  
  calculate() {
    return 
  }
}`;

    const doc = createMockDocument(code, "typescript", "class.ts");
    const scope = extractCurrentScope(doc, { line: 6, character: 11 } as Position);

    expect(scope).toContain("class MyClass");
    expect(scope).toContain("calculate");
  });
});
