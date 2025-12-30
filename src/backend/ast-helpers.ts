import * as acorn from "acorn";
import * as walk from "acorn-walk";
import type { API } from "../frontend/api";

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
 * Inject a function call into a class constructor.
 * The injected function receives: (api, self, ...constructorArgs)
 */
export const injectIntoConstructor = (
  classNode: any,
  fn: (api: API, self: any, ...args: any[]) => void | Promise<void>
): boolean => {
  const constructor = getMethod(classNode, "constructor");
  if (!constructor) {
    return false;
  }
  return injectFunctionIntoMethod(constructor, fn);
};

/**
 * Inject a function call into a named method.
 * The injected function receives: (api, self, ...methodArgs)
 */
export const injectIntoMethod = (
  classNode: any,
  methodName: string,
  fn: (api: API, self: any, ...args: any[]) => void | Promise<void>
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
  functionExpr: (api: API, self: any, ...args: any[]) => void | Promise<void>
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

// Get the API URL at bundle time (ast-helpers runs in extension context)
const API_URL = browser.runtime.getURL("api.js");

/**
 * Convert a JavaScript function to an AST node that:
 * 1. Wraps in an async IIFE
 * 2. Dynamically imports the api module
 * 3. Invokes the function with (api, self, ...args)
 */
const functionToCallExpressionNode = (
  functionExpr: (api: API, self: any, ...args: any[]) => void | Promise<void>
): any => {
  const fnString = functionExpr.toString();

  // Parse the async IIFE wrapper that imports api and calls the injector
  // The injector function receives: api (imported module with named exports), self (this), and original arguments
  // We must await __tla (top-level await promise) before the exports are populated
  const wrapperCode = `(async () => {
    const api = await import("${API_URL}");
    await api.__tla;
    const args = Array.from(arguments);
    (${fnString})(api, this, ...args);
  }).call(this)`;

  try {
    const parsed = acorn.parse(wrapperCode, {
      ecmaVersion: "latest",
    }) as any;

    return parsed.body[0];
  } catch (error) {
    console.error("[AST Helpers] Failed to parse injector function:", error);
    return null;
  }
};
