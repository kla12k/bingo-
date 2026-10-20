import { createStakeHandler } from "@/lib/stakes/api-handler";
import { createStake, listStakes } from "@/lib/stakes/application/stake-service";

export default createStakeHandler({
  GET: () => listStakes(),
  POST: (req) => createStake(req.headers.authorization, req.body ?? {}),
});
