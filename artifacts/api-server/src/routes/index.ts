import { Router, type IRouter } from "express";
import downloaderRouter from "./downloader";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(downloaderRouter);
router.use(healthRouter);

export default router;
