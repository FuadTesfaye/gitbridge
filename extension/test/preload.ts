import { mock } from "bun:test";
import * as mockVscode from "./mocks/vscode";

mock.module("vscode", () => mockVscode);
