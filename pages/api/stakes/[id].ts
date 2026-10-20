import { createStakeHandler } from "@/lib/stakes/api-handler";
import { deleteStake, updateStake } from "@/lib/stakes/application/stake-service";

export default createStakeHandler({
  PUT: (req) => updateStake(req.headers.authorization, req.query.id, req.body ?? {}),
  DELETE: async (req) => {
    await deleteStake(req.headers.authorization, req.query.id);
    return null;
  },
});
