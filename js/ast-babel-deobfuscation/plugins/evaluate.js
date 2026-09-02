import {
  isPropMutated,
  resolveToRootBinding,
  PROTO_METHODS,
} from "../utils.js";
import generate from "@babel/generator";
import vm from "vm";
import fs from "fs";

export default function (babel) {
  const { types: t } = babel;
  return {
    name: "evaluatefuncs",
    visitor: {
      Program(programPath) {
        const cache = new Map();

        programPath.traverse({
          CallExpression: {
            exit(path) {
              const args = path.node.arguments;
              const areAllNumeric =
                args.length > 0 &&
                args.every(
                  (arg) =>
                    t.isNumericLiteral(arg) ||
                    (t.isUnaryExpression(arg) &&
                      arg.operator === "-" &&
                      t.isNumericLiteral(arg.argument)),
                );

              if (!areAllNumeric) return;

              // Resolver el nombre de la función aunque sea (c = _0x1206)(236)
              let functionName = null;
              const callee = path.node.callee;

              if (t.isIdentifier(callee)) {
                functionName = callee.name;
              } else if (
                t.isAssignmentExpression(callee) &&
                t.isIdentifier(callee.right)
              ) {
                // (c = _0x1206)(236) → usar _0x1206
                functionName = callee.right.name;
              } else if (
                t.isSequenceExpression(callee) &&
                callee.expressions.length > 0
              ) {
                // (0, _0x1206)(236) → usar _0x1206
                const last = callee.expressions[callee.expressions.length - 1];
                if (t.isIdentifier(last)) functionName = last.name;
              }

              if (!functionName) return;

              // Obtener el valor numérico real de cada argumento
              const resolveNumericArg = (arg) => {
                if (t.isNumericLiteral(arg)) return arg.value;
                if (
                  t.isUnaryExpression(arg) &&
                  arg.operator === "-" &&
                  t.isNumericLiteral(arg.argument)
                )
                  return -arg.argument.value;
                return null;
              };

              const resolvedArgs = args.map(resolveNumericArg);
              if (resolvedArgs.some((v) => v === null)) return;

              // parseInt skip
              const parentCall = path.parentPath;
              if (
                parentCall.isCallExpression() &&
                parentCall.node.callee.name === "parseInt"
              )
                return;

              let decryptorBinding;

              if (!cache.has(functionName)) {
                decryptorBinding = resolveToRootBinding(
                  functionName,
                  path.scope,
                );
                if (!decryptorBinding) return;

                const bindingName = decryptorBinding.identifier.name;

                let decryptorFunctionPath = null;
                if (decryptorBinding.path.isFunctionDeclaration()) {
                  decryptorFunctionPath = decryptorBinding.path;
                }
                if (!decryptorFunctionPath) return;

                const decryptorBody = decryptorFunctionPath.node.body.body;
                const lastDec = decryptorBody[1];
                if (!t.isReturnStatement(lastDec)) return;

                const arraysFuncCalleeName =
                  lastDec.argument.object?.callee.name;
                const arraysFuncBinding =
                  path.scope.getBinding(arraysFuncCalleeName);
                if (!arraysFuncBinding) return;

                let arraysFunctionPath = null;
                if (arraysFuncBinding.path.isFunctionDeclaration()) {
                  arraysFunctionPath = arraysFuncBinding.path;
                }
                if (!arraysFunctionPath) return;

                let iifeCode = "";
                for (const arraysFuncRefPath of arraysFuncBinding.referencePaths) {
                  const exprStatem = arraysFuncRefPath.findParent((p) =>
                    p.isExpressionStatement(),
                  );
                  if (!exprStatem) continue;

                  const expr = exprStatem.node.expression;
                  const nestedBody = expr.callee.body.body;

                  const hasFunction = nestedBody.some((nodx) =>
                    t.isFunction(nodx),
                  );
                  if (hasFunction) continue;

                  if (t.isCallExpression(expr)) {
                    const refArgs = expr.arguments;
                    if (refArgs?.length == 0) {
                      iifeCode = exprStatem.toString();
                      break;
                    }
                  }
                }

                cache.set(functionName, {
                  bindingName,
                  iifeCode,
                  arraysFunctionCode: generate(arraysFunctionPath.node).code,
                  decryptorCode: generate(decryptorFunctionPath.node).code,
                });
              }

              const {
                bindingName: cachedBindingName,
                iifeCode,
                arraysFunctionCode,
                decryptorCode,
              } = cache.get(functionName);

              const codeToEvaluate = `${cachedBindingName}(${resolvedArgs.join(", ")})`;

              const singleEvaluationCode = `/* --- IIFE ROTATION --- */
${iifeCode}
/* --- ARRAYS --- */
${arraysFunctionCode}
/* --- DECRYPTOR --- */
${decryptorCode}
/* --- CODE TO EVALUATE --- */
${codeToEvaluate}`;

              const context = vm.createContext({});
              let result;
              fs.writeFileSync("debug_vm_runtime.js", singleEvaluationCode);
              result = vm.runInContext(singleEvaluationCode, context);

              if (typeof result === "string") {
                path.replaceWith(t.stringLiteral(result));
              } else if (typeof result === "number") {
                path.replaceWith(t.numericLiteral(result));
              } else if (typeof result === "boolean") {
                path.replaceWith(t.booleanLiteral(result));
              }
              //console.log(codeToEvaluate, "=>", result);
              // Sin path.skip() para que exit pueda procesar nodos hijos primero
            },
          },
        });
      },
    },
  };
}
