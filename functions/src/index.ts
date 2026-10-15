import { setGlobalOptions } from "firebase-functions/v2";
import { REGION } from "./config.js";

setGlobalOptions({ region: REGION, maxInstances: 10 });

// Todas as funções exportadas DEVEM usar o prefixo `md` (ver config.FUNCTION_PREFIX).
