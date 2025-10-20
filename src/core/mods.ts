import * as acorn from "acorn";
import * as walk from "acorn-walk";
import { generate } from "astring";

export type MethodMod = {
  name: string; // "constructor" or method name
  injection: (...args: any[]) => void; // Function to inject
};

export type ClassMod = {
  name: string; // Descriptive name for logging
  requiredMethods: string[]; // Method names that must be present
  methodMods: MethodMod[];
};

export type LibraryMod = {
  keyword: string; // Keyword to search for in script files
  classes: ClassMod[];
};

export const applyLibraryMods = (source: string, libraryMods: LibraryMod[]) => {
  const matchingLibraryMods = libraryMods.filter((mod) => source.toLowerCase().includes(mod.keyword.toLowerCase()));

  if (matchingLibraryMods.length === 0) {
    return source;
  }

  // parse ast
  let ast: acorn.Node;
  try {
    ast = acorn.parse(source, {
      ecmaVersion: "latest",
      sourceType: "module",
    });
  } catch (error) {
    console.error("[Interceptor] Failed to parse source:", error);
    return source;
  }

  for (const libraryMod of matchingLibraryMods) {
    walk.simple(ast, {
      ClassDeclaration(node: acorn.Node) {
        applyClassMods(node, libraryMod.classes);
      },
      ClassExpression(node: acorn.Node) {
        applyClassMods(node, libraryMod.classes);
      },
    });
  }

  // Serialize the modified AST back to code
  try {
    return generate(ast);
  } catch (error) {
    console.error("[Interceptor] Failed to generate code:", error);
    return source;
  }
};

const applyClassMods = (node: acorn.Node, classMods: ClassMod[]) => {
  for (const classMod of classMods) {
    applyClassMod(node, classMod);
  }
};

const applyClassMod = (node: any, classPattern: ClassMod) => {
  const methodNames = extractMethodsFromClassBody(node.body.body);

  for (const methodName of classPattern.requiredMethods) {
    if (!methodNames[methodName]) {
      return;
    }
  }

  // Inject code into specified methods/constructor
  for (const injection of classPattern.methodMods) {
    const method = node.body.body.find((member: any) => member.type === "MethodDefinition" && member.key.type === "Identifier" && member.key.name === injection.name);

    if (method) {
      console.log(`[Interceptor] Injecting into ${classPattern.name}.${injection.name}`);
      if (injectFunctionExprIntoMethod(method, injection.injection)) {
      }
    }
  }
};

const extractMethodsFromClassBody = (classBody: acorn.ClassBody): Record<string, acorn.MethodDefinition> => {
  const methodsByName: Record<string, acorn.MethodDefinition> = {};

  // According to acorn's types, classBody.body (not just classBody) is the correct iterable part
  const bodyElements = (classBody as any).body ?? classBody; // fallback if not a full ClassBody object

  for (const node of bodyElements) {
    if (node.type === "MethodDefinition" && node.key && node.key.type === "Identifier") {
      methodsByName[node.key.name] = node as acorn.MethodDefinition;
    }
  }
  return methodsByName;
};

// Inject a function call into a method or constructor
const injectFunctionExprIntoMethod = (method: any, functionExpr: (...args: any[]) => void): boolean => {
  if (method.value && method.value.type === "FunctionExpression" && method.value.body) {
    const body = method.value.body;
    if (body.type === "BlockStatement" && Array.isArray(body.body)) {
      const injectionNode = functionToCallExpressionNode(functionExpr);
      if (injectionNode) {
        body.body.unshift(injectionNode);
        return true;
      }
    }
  }
  return false;
};

const functionToCallExpressionNode = (functionExpr: (...args: any[]) => void): any => {
  // Convert the function to a string and parse it as AST
  const fnString = functionExpr.toString();

  // Parse the function expression
  let fnExpression: any;
  try {
    // Try parsing as arrow function or regular function
    const parsed = acorn.parse(`(${fnString})`, {
      ecmaVersion: "latest",
    }) as any;

    // Extract the function expression from the parsed program
    fnExpression = parsed.body[0].expression;
  } catch (error) {
    console.error("[Interceptor] Failed to parse injector function:", error);
    return null;
  }

  // Create a call expression that invokes the function with spread arguments
  // Result: ((injectorFn)(...arguments))
  return {
    type: "ExpressionStatement",
    expression: {
      type: "CallExpression",
      callee: fnExpression,
      arguments: [
        {
          type: "SpreadElement",
          argument: { type: "Identifier", name: "arguments" },
        },
      ],
    },
  };
};
