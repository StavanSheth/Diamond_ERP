export interface PathValidationResult {
    valid: boolean;
    canonicalPath: string;
    error?: string;
    isExternal: boolean;
}
export declare function canonicalizeDatabasePath(rawPath: string): PathValidationResult;
//# sourceMappingURL=database-path.util.d.ts.map