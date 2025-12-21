import * as acorn from "acorn";
import * as walk from "acorn-walk";

/**
 * Iterate over all class declarations and expressions in an AST
 */
export const forEachClass = (ast: acorn.Node, callback: (node: any) => void): void => {
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
    if (node.type === "MethodDefinition" && node.key && node.key.type === "Identifier") {
      methodsByName[node.key.name] = node;
    }
  }
  return methodsByName;
};

/**
 * Inject a function call into a class constructor
 */
export const injectIntoConstructor = (classNode: any, fn: (self: any, ...args: any[]) => void): boolean => {
  const constructor = getMethod(classNode, "constructor");
  if (!constructor) {
    return false;
  }
  return injectFunctionIntoMethod(constructor, fn);
};

/**
 * Inject a function call into a named method
 */
export const injectIntoMethod = (classNode: any, methodName: string, fn: (self: any, ...args: any[]) => void): boolean => {
  const method = getMethod(classNode, methodName);
  if (!method) {
    return false;
  }
  return injectFunctionIntoMethod(method, fn);
};

/**
 * Inject a function call into a method node
 */
const injectFunctionIntoMethod = (method: any, functionExpr: (self: any, ...args: any[]) => void): boolean => {
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
const injectAfterSuperCalls = (constructorBody: any, injectionNode: any): boolean => {
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
          if (parent === constructorBody && Array.isArray(constructorBody.body)) {
            superCalls.push({ statement: ancestor, block: constructorBody.body });
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
 * Convert a JavaScript function to an AST call expression node
 * that invokes the function with `this` as first arg and spreads `arguments`
 */
const functionToCallExpressionNode = (functionExpr: (self: any, ...args: any[]) => void): any => {
  const fnString = functionExpr.toString();

  let fnExpression: any;
  try {
    const parsed = acorn.parse(`(${fnString})`, {
      ecmaVersion: "latest",
    }) as any;

    fnExpression = parsed.body[0].expression;
  } catch (error) {
    console.error("[AST Helpers] Failed to parse injector function:", error);
    return null;
  }

  // Create a call expression: ((injectorFn)(this, ...arguments))
  return {
    type: "ExpressionStatement",
    expression: {
      type: "CallExpression",
      callee: fnExpression,
      arguments: [
        { type: "ThisExpression" },
        {
          type: "SpreadElement",
          argument: { type: "Identifier", name: "arguments" },
        },
      ],
    },
  };
};

