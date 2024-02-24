"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.iscript = exports.tokenize = exports.Env = exports.parseScript = void 0;
const const_1 = require("./const");
const types_1 = require("./types");
const cache_1 = require("./utils/cache");
const tokenizr_1 = __importDefault(require("tokenizr"));
exports.parseScript = (0, cache_1.withCache)((script) => {
    const tokens = tokenize(script);
    if (tokens.length) {
        const automations = parseAutomations(trimStartLinebreaks(tokens), []);
        return automations;
    }
    else {
        return [];
    }
});
class Env {
    constructor(pair, prevEnv) {
        this.pair = pair;
        this.prev = prevEnv;
    }
    search(key) {
        const result = this.pair[0] === key;
        if (result) {
            const s = this.pair[1];
            if (typeof s === "function") {
                return s(this);
            }
            else {
                return s;
            }
        }
        else {
            if (this.prev) {
                return this.prev.search(key);
            }
            else {
                throwError(`variable: ${key} not found is context`);
            }
        }
        return null;
    }
    update(key, value) {
        this.pair = [key, value];
    }
    extend(key, value) {
        return new Env([key, value], this);
    }
}
exports.Env = Env;
const Keywords = [
    "automation",
    "for",
    "on",
    "end",
    "listen",
    "open",
    "active",
    "wait",
    "close",
    "emit",
    "as",
    "with",
    "apply",
    "len",
    "exist",
];
function parseAutomations(tokens, automations) {
    const { automationTokens, restTokens } = getAutomationTokens(tokens);
    const automation = parseAutomation(automationTokens);
    automations.push(automation);
    if (hasValidTokens(restTokens)) {
        return parseAutomations(restTokens, automations);
    }
    else {
        return automations;
    }
}
function hasValidTokens(tokens) {
    return tokens.length > 0 && !isEOF(tokens[0]);
}
function isEOF(token) {
    return token.type === "EOF";
}
function getAutomationTokens(tokens) {
    const isStart = isAutomationStart(tokens[0]);
    const index = tokens.findIndex((token) => isAutomationEnd(token));
    if (isStart && index > -1) {
        return {
            automationTokens: tokens.slice(0, index + 1),
            restTokens: trimStartLinebreaks(tokens.slice(index + 1)),
        };
    }
    else {
        throw new Error("automation not found");
    }
}
function trimStartLinebreaks(tokens) {
    let cursor = 0;
    while (isLinebreak(tokens[cursor])) {
        cursor++;
    }
    return tokens.slice(cursor);
}
function isLinebreak(token) {
    return token.type === "linebreak";
}
function isAutomationStart(token) {
    return token.type === "id" && token.value === "automation";
}
function isAutomationEnd(token) {
    return token.type === "id" && token.value === "end";
}
function parseAutomation(tokens) {
    const env = new Env(["empty", null]);
    const { firstLine, rest } = getFirstLineTokens(tokens);
    const { urlRegStr, stage } = parseAutomationStart(firstLine, env);
    const bodyTokens = rest.slice(0, -1);
    const instructions = parseAutomationBody(bodyTokens, env);
    return {
        pattern: urlRegStr,
        runAt: stage2runAt(stage),
        instructions,
        env,
    };
}
function stage2runAt(stage) {
    switch (stage) {
        case "immediate":
            return types_1.RunAt.START;
        case "load":
            return types_1.RunAt.END;
        case "delay":
            return types_1.RunAt.IDLE;
        default:
            throwError(`unsupport stage: ${stage}`);
    }
}
function parseAutomationStart(tokens, env) {
    const rules = [
        { type: "id", keyword: "automation" },
        { type: "id", keyword: "for" },
        { type: "string", variableName: "urlRegStr" },
        { type: "id", keyword: "on" },
        { type: "string", variableName: "stage" },
        { type: "linebreak" },
    ];
    return matchTokensWithRules(tokens, rules, env);
}
function parseAutomationBody(tokens, env) {
    return parseStatements(tokens, [], env);
}
function parseStatements(tokens, instructions, env) {
    const { firstLine, rest } = getFirstLineTokens(tokens);
    const [newEnv, instruction] = parseStatement(firstLine, env);
    if (instruction) {
        instructions.push(instruction);
    }
    if (rest.length) {
        return parseStatements(rest, instructions, newEnv);
    }
    else {
        return instructions;
    }
}
function parseStatement(tokens, env) {
    const firstToken = tokens[0];
    if (isAssignStatementStart(firstToken)) {
        return parseAssignStatement(tokens, env);
    }
    else if (isNativeStatementStart(firstToken)) {
        return [env, parseNativeStatement(tokens, env)];
    }
    else if (isApplyStatementStart(firstToken)) {
        return [env, parseApplyStatement(tokens, env)];
    }
    else if (isRequireStatementStart(firstToken)) {
        return [env, parseRequireStatement(tokens, env)];
    }
    else {
        throwError("unsupport statement", tokens[0]);
    }
    return [env, undefined];
}
function parseApplyStatement(tokens, env) {
    return parseApplyExp(tokens.slice(0, -1), env);
}
function parseApplyExp(tokens, env) {
    const { head, middle, tail } = getApplyExpParts(tokens);
    const headParams = parseApplyHeadExp(head, env);
    const middleParams = parseArgsPairsExp(middle, env);
    const { scope } = parseApplyTailExp(tail, env);
    return {
        action: headParams.action,
        args: {
            ...middleParams,
        },
        env,
        scope: scope,
    };
}
function parseApplyTailExp(tokens, env) {
    const rules = [
        { type: "id", keyword: "on" },
        { type: "string", variableName: "scope" },
    ];
    return matchTokensWithRules(tokens, rules, env);
}
function parseApplyHeadExp(tokens, env) {
    const rules = [
        { type: "id", keyword: "apply" },
        { type: "string", variableName: "action" },
        { type: "id", variableName: "with" },
    ];
    return matchTokensWithRules(tokens, rules, env);
}
function getApplyExpParts(tokens) {
    const headTokens = tokens.slice(0, 3);
    const middleTokens = tokens.slice(3, -2);
    const tailTokens = tokens.slice(-2);
    return {
        head: headTokens,
        middle: middleTokens,
        tail: tailTokens,
    };
}
function parseNativeStatement(tokens, env) {
    const keyword = tokens[0].value;
    switch (keyword) {
        case "open":
            return parseOpenStatement(tokens, env);
        case "active":
            return parseActiveStatement(tokens, env);
        case "wait":
            return parseWaitStatement(tokens, env);
        case "close":
            return parseCloseStatement(tokens, env);
        case "emit":
            return parseEmitStatement(tokens, env);
        case "listen":
            return parseListenStatement(tokens, env);
        default:
            break;
    }
}
function parseListenStatement(tokens, env) {
    return parseListenExp(tokens.slice(0, -1), env);
}
function parseEmitStatement(tokens, env) {
    return parseEmitExp(tokens.slice(0, -1), env);
}
function parseEmitExp(tokens, env) {
    const { head, tail } = getEmitExpParts(tokens);
    const headParams = parseEmitHeadExp(head, env);
    const tailParams = parseArgsPairsExp(tail, env);
    return {
        action: const_1.BUILTIN_ACTIONS.EVENT,
        args: {
            ...headParams,
            ...tailParams,
            type: "emit",
        },
        env,
    };
}
function parseEmitHeadExp(tokens, env) {
    const rules = [
        { type: "id", keyword: "emit" },
        { type: "string", variableName: "events" },
        { type: "id", keyword: "with" },
    ];
    return matchTokensWithRules(tokens, rules, env);
}
function parseArgsPairsExp(tokens, env) {
    const start = tokens.shift();
    matchRule(start, { type: "LeftParenthesis", keyword: "(" }, env);
    const end = tokens.pop();
    matchRule(end, { type: "RightParenthesis", keyword: ")" }, env);
    return parseArgsExp(tokens, {}, env);
}
function parseArgsExp(tokens, pairs, env) {
    if (tokens.length) {
        const { first, rest } = getFirstPairTokens(tokens);
        const pair = parseArgExp(first, env);
        Object.assign(pairs, pair);
        return parseArgsExp(rest, pairs, env);
    }
    else {
        return pairs;
    }
}
function parseArgExp(tokens, env) {
    const { head, tail } = getArgExpPart(tokens);
    const key = parseArgExpHead(head, env);
    const value = parseArgExpTail(tail, env);
    return {
        [key]: value,
    };
}
function parseArgExpTail(tokens, env) {
    const token = tokens[0];
    if (tokens.length > 1) {
        throwError("parseArgExp error", token);
    }
    const isId = token.type === "id";
    if (isId) {
        return env.search(parseVariableExp(token));
    }
    else {
        return parseValueExp(tokens[0]);
    }
}
function parseArgExpHead(tokens, env) {
    const rules = [
        {
            type: "id",
        },
        {
            type: "char",
            keyword: "=",
        },
    ];
    matchTokensWithRules(tokens, rules, env);
    return parseVariableExp(tokens[0]);
}
function getArgExpPart(tokens) {
    return {
        head: tokens.slice(0, 2),
        tail: tokens.slice(2),
    };
}
function getFirstPairTokens(tokens) {
    const commaIndex = tokens.findIndex((token) => token.type === "char" && token.value === ",");
    if (commaIndex === -1) {
        return {
            first: tokens,
            rest: [],
        };
    }
    else {
        return {
            first: tokens.slice(0, commaIndex),
            rest: tokens.slice(commaIndex + 1),
        };
    }
}
function isRuleType(tokenType, ruleType) {
    if (Array.isArray(ruleType)) {
        return ruleType.includes(tokenType);
    }
    else {
        return ruleType === tokenType;
    }
}
function matchRule(token, rule, env) {
    if (rule && isRuleType(token.type, rule.type)) {
        if (rule.keyword) {
            if (rule.keyword === token.value) {
                if (rule.isVariable) {
                    return env.search(token.value);
                }
            }
            else {
                throwError(`parse error: `, token, rule);
            }
        }
        else if (rule.variableName) {
            return {
                [rule.variableName]: token.value,
            };
        }
    }
    else {
        throwError(`parse error: `, token, rule);
    }
}
function getEmitExpParts(tokens) {
    const headTokens = tokens.slice(0, 3);
    const tailTokens = tokens.slice(3);
    return {
        head: headTokens,
        tail: tailTokens,
    };
}
function parseCloseStatement(tokens, env) {
    return parseCloseExp(tokens.slice(0, -1), env);
}
function parseCloseExp(tokens, env) {
    const rules = [{ type: "id", keyword: "close" }];
    return {
        action: const_1.BUILTIN_ACTIONS.CLOSE_PAGE,
        args: matchTokensWithRules(tokens, rules, env),
        env,
    };
}
function parseWaitStatement(tokens, env) {
    return parseWaitExp(tokens.slice(0, -1), env);
}
function parseWaitExp(tokens, env) {
    const rules = [
        { type: "id", keyword: "wait" },
        {
            type: "number",
            variableName: "time",
        },
    ];
    return {
        action: const_1.BUILTIN_ACTIONS.WAIT,
        args: matchTokensWithRules(tokens, rules, env),
        env,
    };
}
function parseActiveStatement(tokens, env) {
    return parseActiveExp(tokens.slice(0, -1), env);
}
function parseActiveExp(tokens, env) {
    const rules = [{ type: "id", keyword: "active" }];
    return {
        action: const_1.BUILTIN_ACTIONS.ACTIVE,
        args: matchTokensWithRules(tokens, rules, env),
        env,
    };
}
function parseOpenStatement(tokens, env) {
    return parseOpenExp(tokens.slice(0, -1), env);
}
function parseOpenExp(tokens, env) {
    const rules = [
        { type: "id", keyword: "open" },
        { type: "string", variableName: "url" },
        { type: "id", keyword: "as" },
        { type: "string", variableName: "pattern" },
    ];
    return {
        action: const_1.BUILTIN_ACTIONS.OPEN_PAGE,
        args: matchTokensWithRules(tokens, rules, env),
        env,
    };
}
function isAssignStatementStart(token) {
    return token.type === "id" && token.value === "set";
}
function isNativeStatementStart(token) {
    return (token.type === "id" &&
        ["open", "active", "wait", "close", "emit", "listen"].includes(token.value));
}
function isApplyStatementStart(token) {
    return token.type === "id" && token.value === "apply";
}
function isRequireStatementStart(token) {
    return token.type === "id" && token.value === "require";
}
function parseRequireStatement(tokens, env) {
    return parseComparisonExp(tokens.slice(1, -1), env);
}
function parseComparisonExp(tokens, env) {
    const rules = [
        { type: ["id", "string", "number"] },
        { type: "operator" },
        { type: ["id", "string", "number"] },
    ];
    matchTokensWithRules(tokens, rules, env);
    const [left, operator, right] = tokens;
    const leftValue = parseValuableExp([left], left.value, env);
    const rightValue = parseValuableExp([right], right.value, env);
    const value = generateComparisonExpValue(leftValue, rightValue, operator.value);
    return {
        action: const_1.BUILTIN_ACTIONS.REQUIRE,
        args: {},
        env,
        effect: () => {
            if (typeof value === "function") {
                return Boolean(value(env));
            }
            else {
                return Boolean(value);
            }
        },
    };
}
function generateComparisonExpValue(left, right, operator) {
    const leftValue = left.value;
    const rightValue = right.value;
    if (typeof leftValue === "function" || typeof rightValue === "function") {
        return (env) => {
            const left = typeof leftValue === "function" ? leftValue(env) : leftValue;
            const right = typeof rightValue === "function" ? rightValue(env) : rightValue;
            return compare(left, right, operator);
        };
    }
    else {
        return compare(leftValue, rightValue, operator);
    }
}
function compare(left, right, operator) {
    switch (operator) {
        case "==":
            return left === right;
        case ">":
            return left > right;
        case ">=":
            return left >= right;
        case "<":
            return left < right;
        case "<=":
            return left <= right;
        default:
            throwError(`unsupport operator: ${operator}`);
    }
    return false;
}
function parseAssignStatement(tokens, env) {
    const equalIndex = tokens.findIndex((token) => token.value === "=");
    const assignExpTokens = tokens.slice(0, equalIndex);
    const valuableExpTokens = tokens.slice(equalIndex + 1, -1);
    const variable = parseAssignExp(assignExpTokens, env);
    const { value, instruction } = parseValuableExp(valuableExpTokens, variable, env);
    const newEnv = env.extend(variable, value);
    return [newEnv, instruction];
}
function parseAssignExp(tokens, env) {
    const rules = [{ type: "id", keyword: "set" }, { type: "id" }];
    matchTokensWithRules(tokens, rules, env);
    return tokens[1].value;
}
function parseValuableExp(tokens, key, env) {
    const [first, ...rest] = tokens;
    if (isValue(first) && expectExpEnd(rest)) {
        return { value: parseValueExp(first) };
    }
    else if (isVariable(first) && expectExpEnd(rest)) {
        return {
            value: (env) => env.search(parseVariableExp(first)),
        };
    }
    else if (isListenExpStart(first)) {
        const instruction = parseListenExp(tokens, env);
        // NOTE: a little hack, since the listen action is async
        instruction.effect = (options) => env.update(key, options.value);
        return {
            value: null,
            instruction,
        };
    }
    else {
        return {
            value: parseFunctionCallExp(tokens, env),
        };
    }
}
function parseFunctionCallExp(tokens, env) {
    const rules = [
        { type: "id" },
        { type: "LeftParenthesis" },
        { type: "string" },
        { type: "RightParenthesis" },
    ];
    matchTokensWithRules(tokens, rules, env);
    const [funcName, , arg] = tokens;
    if (isSupportFunctionName(funcName.value)) {
        return resolveFunctionCallValue(funcName.value, arg.value);
    }
    else {
        throwError(`unsupport function: ${funcName.value}`);
    }
}
function resolveFunctionCallValue(name, arg) {
    if (name === "len") {
        // HACK: a little hack, since the dom query is async
        return () => document.querySelectorAll(arg).length;
    }
    else if (name === "exist") {
        return () => document.querySelector(arg) !== null;
    }
}
function isSupportFunctionName(name) {
    return ["len", "exist"].includes(name);
}
function parseListenExp(tokens, env) {
    const rules = [
        { type: "id", keyword: "listen" },
        { type: "string", variableName: "events" },
        { type: "id", keyword: "on" },
        { type: "string", variableName: "scope" },
    ];
    const { scope, ...args } = matchTokensWithRules(tokens, rules, env);
    return {
        action: const_1.BUILTIN_ACTIONS.EVENT,
        args,
        env,
        scope: scope,
    };
}
function isListenExpStart(token) {
    return token.type === "id" && token.value === "listen";
}
function expectExpEnd(tokens) {
    if (tokens.length === 0) {
        return true;
    }
    else {
        throwError("expect exp end, but found", tokens[0]);
    }
}
function parseValueExp(token) {
    const { type, value } = token;
    if (type === "number") {
        return value;
    }
    else if (type === "boolean") {
        return value;
    }
    else if (type === "string") {
        return value;
    }
    else {
        throwError("parse value exp error: ", token);
    }
}
function parseVariableExp(token) {
    return token.value;
}
function isValue(token) {
    const { type } = token;
    return type === "number" || type === "string" || type === "boolean";
}
function isVariable(token) {
    return token.type === "id" && !Keywords.includes(token.value);
}
function throwError(msg, token, rule) {
    throw new Error(`${msg} ${token ? ["at", token.toString()].join(" ") : ""} ${rule ? ["with", JSON.stringify(rule)].join("") : ""}`);
}
function matchTokensWithRules(tokens, rules, env) {
    return tokens.reduce((memo, token, index) => {
        const rule = rules[index];
        const part = matchRule(token, rule, env);
        return {
            ...memo,
            ...part,
        };
    }, {});
}
function getFirstLineTokens(tokens) {
    const index = tokens.findIndex((token) => isLinebreak(token));
    if (index > -1) {
        return {
            firstLine: tokens.slice(0, index + 1),
            rest: tokens.slice(index + 1),
        };
    }
    else {
        return {
            firstLine: tokens,
            rest: [],
        };
    }
}
// tokenize
function createLexer() {
    const lexer = new tokenizr_1.default();
    lexer.rule(/(^|\s*)#.*/, (ctx) => {
        ctx.ignore();
    });
    lexer.rule(/[a-zA-Z_][a-zA-Z0-9_]*/, (ctx) => {
        ctx.accept("id");
    });
    lexer.rule(/[+-]?[0-9]+/, (ctx, match) => {
        ctx.accept("number", parseInt(match[0]));
    });
    lexer.rule(/"([^\r\n"]*)"/, (ctx, match) => {
        ctx.accept("string", match[1].replace(/\\"/g, '"'));
    });
    lexer.rule(/(>=|>|<=|<|==)/, (ctx) => {
        ctx.accept("operator");
    });
    lexer.rule(/\(/, (ctx) => {
        ctx.accept("LeftParenthesis");
    });
    lexer.rule(/\)/, (ctx) => {
        ctx.accept("RightParenthesis");
    });
    lexer.rule(/\/\/[^\r\n]*\r?\n/, (ctx) => {
        ctx.ignore();
    });
    lexer.rule(/[ \t]+/, (ctx) => {
        ctx.ignore();
    });
    lexer.rule(/[\r\n]+/, (ctx) => {
        ctx.accept("linebreak");
    });
    lexer.rule(/./, (ctx) => {
        ctx.accept("char");
    });
    return lexer;
}
function tokenize(script) {
    const lexer = createLexer();
    lexer.input(script);
    const tokens = lexer.tokens();
    return tokens;
}
exports.tokenize = tokenize;
exports.iscript = {
    string: {
        pattern: /"(?:[^"\\]|\\.)*"/,
        greedy: true,
    },
    number: /(?:\b\d+(?:\.\d+)?|\B\.\d+)(?:[eE][+-]?\d+)?\b/,
    comment: {
        pattern: /(^|\s)#.*/,
        greedy: true,
    },
    keyword: [
        {
            pattern: /automation\b/,
            alias: "operator",
        },
        {
            pattern: /end\b/,
            alias: "operator",
        },
        {
            pattern: /true|false\b/,
            alias: "boolean",
        },
        {
            pattern: /open\b|close\b|wait\b|active\b|listen\b|emit\b|apply\b|\blen\b|\bexist\b/,
            alias: "function",
        },
        {
            pattern: /\bfor\b|\bon\b|\bas\b|\bwith\b/,
            alias: "operator",
        },
        {
            pattern: /set\b/,
            alias: "variable",
        },
        {
            pattern: /get\b/,
            alias: "property",
        },
    ],
    identifier: {
        pattern: /[a-zA-Z_][a-zA-Z0-9_]*/,
        alias: "variable",
    },
};
