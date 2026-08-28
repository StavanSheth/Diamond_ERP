import cors from 'cors';
/**
 * CORS configuration.
 * Allows requests from the Vite dev server (localhost:5173) and any localhost port.
 */
export declare const corsMiddleware: (req: cors.CorsRequest, res: {
    statusCode?: number | undefined;
    setHeader(key: string, value: string): any;
    end(): any;
}, next: (err?: any) => any) => void;
//# sourceMappingURL=cors.d.ts.map