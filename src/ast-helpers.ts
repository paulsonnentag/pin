import * as acorn from "acorn";
import * as walk from "acorn-walk";

// Extension URL for dynamic imports - set from background.ts
let extensionLibUrl: string | null = null;

// Current tab's document URL - set before each script transformation
let currentTabDocUrl: string | null = null;

/**
 * Set the extension library URL for dynamic imports
 * Call this from background.ts with browser.runtime.getURL("lib.js")
 */
export const setExtensionLibUrl = (url: string): void => {
  extensionLibUrl = url;
};

/**
 * Get the extension URL for dynamic imports
 */
export const getExtensionLibUrl = (): string => {
  if (!extensionLibUrl) {
    throw new Error(
      "Extension lib URL not set. Call setExtensionLibUrl first."
    );
  }
  return extensionLibUrl;
};

/**
 * Set the current tab's document URL for injection
 * Call this before each script transformation
 */
export const setTabDocUrl = (url: string): void => {
  currentTabDocUrl = url;
};

/**
 * Get the current tab's document URL
 */
export const getTabDocUrl = (): string => {
  if (!currentTabDocUrl) {
    throw new Error("Tab doc URL not set. Call setTabDocUrl first.");
  }
  return currentTabDocUrl;
};

/**
 * Iterate over all class declarations and expressions in an AST
 */
export const forEachClass = (
  ast: acorn.Node,
  callback: (node: any) => void
): void => {
  walk.simple(ast, {
    ClassDeclaration(node: acorn.Node) {
      callback(node);
    },
    ClassExpression(node: acorn.Node) {
      callback(node);
    },
  });
};

/**
 * Check if a class node has all the specified method names
 */
export const hasMethodNames = (classNode: any, names: string[]): boolean => {
  const methods = getMethodsMap(classNode);
  return names.every((name) => name in methods);
};

/**
 * Get a method definition by name from a class node
 */
export const getMethod = (classNode: any, name: string): any | null => {
  const methods = getMethodsMap(classNode);
  return methods[name] ?? null;
};

/**
 * Get all methods from a class as a map
 */
export const getMethodsMap = (classNode: any): Record<string, any> => {
  const methodsByName: Record<string, any> = {};
  const bodyElements = classNode.body?.body ?? [];

  for (const node of bodyElements) {
    if (
      node.type === "MethodDefinition" &&
      node.key &&
      node.key.type === "Identifier"
    ) {
      methodsByName[node.key.name] = node;
    }
  }
  return methodsByName;
};

/**
 * Check if a class contains a specific string literal anywhere in its body
 */
export const classContainsString = (
  classNode: any,
  searchString: string
): boolean => {
  let found = false;

  walk.simple(classNode, {
    Literal(node: any) {
      if (typeof node.value === "string" && node.value === searchString) {
        found = true;
      }
    },
  });

  return found;
};

/**
 * Inject a function call into a class constructor
 */
export const injectIntoConstructor = (
  classNode: any,
  fn: InjectionFunction
): boolean => {
  const constructor = getMethod(classNode, "constructor");
  if (!constructor) {
    return false;
  }
  return injectFunctionIntoMethod(constructor, fn);
};

/**
 * Inject a function call into a named method
 */
export const injectIntoMethod = (
  classNode: any,
  methodName: string,
  fn: InjectionFunction
): boolean => {
  const method = getMethod(classNode, methodName);
  if (!method) {
    return false;
  }
  return injectFunctionIntoMethod(method, fn);
};

/**
 * Inject a function call into a method node
 */
const injectFunctionIntoMethod = (
  method: any,
  functionExpr: InjectionFunction
): boolean => {
  if (method.value?.type !== "FunctionExpression" || !method.value?.body) {
    return false;
  }

  const body = method.value.body;
  if (body.type !== "BlockStatement" || !Array.isArray(body.body)) {
    return false;
  }

  const injectionNode = functionToCallExpressionNode(functionExpr);
  if (!injectionNode) {
    return false;
  }

  const isConstructor = method.kind === "constructor";

  if (isConstructor) {
    // For constructors, inject after super() calls to ensure `this` is available
    return injectAfterSuperCalls(body, injectionNode);
  } else {
    // For regular methods, inject at the start
    body.body.unshift(injectionNode);
    return true;
  }
};

/**
 * Find all super() calls in a constructor body and inject after each one
 */
const injectAfterSuperCalls = (
  constructorBody: any,
  injectionNode: any
): boolean => {
  type SuperCallLocation = { statement: any; block: any[] };
  const superCalls: SuperCallLocation[] = [];

  // Walk the AST to find all super() calls
  walk.ancestor(constructorBody, {
    CallExpression(node: any, _state: any, ancestors: any[]) {
      if (node.callee?.type === "Super") {
        // Walk up ancestors to find the statement that is a direct child of the constructor body
        // This handles super() in any context: ExpressionStatement, IfStatement condition, etc.
        for (let i = ancestors.length - 1; i >= 0; i--) {
          const ancestor = ancestors[i];
          const parent = ancestors[i - 1];

          // Check if this ancestor is a direct child of constructorBody (the BlockStatement)
          if (
            parent === constructorBody &&
            Array.isArray(constructorBody.body)
          ) {
            superCalls.push({
              statement: ancestor,
              block: constructorBody.body,
            });
            break;
          }
        }
      }
    },
  });

  if (superCalls.length === 0) {
    // No super() found - might be a base class constructor, inject at start
    constructorBody.body.unshift(injectionNode);
    return true;
  }

  // Deduplicate - multiple super() calls might be in the same statement (e.g., in ternary)
  const uniqueStatements = new Set(superCalls.map((s) => s.statement));
  const deduped = Array.from(uniqueStatements).map((stmt) => ({
    statement: stmt,
    block: constructorBody.body,
  }));

  // Insert after each statement containing super() (in reverse order to preserve array indices)
  for (const { statement, block } of deduped.reverse()) {
    const idx = block.indexOf(statement);
    if (idx !== -1) {
      // Clone the injection node to avoid sharing the same object
      const clonedNode = JSON.parse(JSON.stringify(injectionNode));
      block.splice(idx + 1, 0, clonedNode);
    }
  }

  return true;
};

/**
 * Injection function type - receives API object with doc handles, self (this), and original args
 */
export type InjectionFunction = (
  api: { tabDocHandle: any },
  self: any,
  ...args: any[]
) => void;

/**
 * Convert a JavaScript function to an AST call expression node
 * that wraps it in an async IIFE with dynamic import of the Pin API.
 *
 * The tab doc URL is inlined into the generated code so the page doesn't need
 * to look it up at runtime.
 *
 * Generated pattern:
 * ```
 * import("url").then(__m => (__m.__tla || Promise.resolve()).then(() => __m.getApi("tabDocUrl"))).then(__api => {
 *   (injectionFn)(__api, this, arg1, arg2, ...);
 * })
 * ```
 */
const functionToCallExpressionNode = (functionExpr: InjectionFunction): any => {
  const libUrl = getExtensionLibUrl();
  const tabDocUrl = getTabDocUrl();
  const fnString = functionExpr.toString();

  // Escape any special characters in the URLs for the string literal
  const escapedLibUrl = libUrl.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const escapedTabDocUrl = tabDocUrl
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');

  // Build injection using Promise chain
  // We capture `this` and `arguments` before the async operation
  // Wait for __tla (vite's top-level await promise) before calling getApi with the inlined tabDocUrl
  const injectionCode = `(function(__pinThis, __pinArguments) {
    import("${escapedLibUrl}").then(function(__pinModule) {
      return (__pinModule.__tla || Promise.resolve()).then(function() {
        return __pinModule.getApi("${escapedTabDocUrl}");
      });
    }).then(function(__pinApi) {
      (${fnString}).apply(null, [__pinApi, __pinThis].concat([].slice.call(__pinArguments)));
    });
  })(this, arguments)`;

  try {
    const parsed = acorn.parse(injectionCode, {
      ecmaVersion: "latest",
    }) as any;
    return parsed.body[0];
  } catch (error) {
    console.error("[AST Helpers] Failed to parse injection code:", error);
    console.error("[AST Helpers] Injection code was:", injectionCode);
    return null;
  }
};
