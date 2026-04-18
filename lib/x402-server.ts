import {
  x402ResourceServer,
  HTTPFacilitatorClient,
  type FacilitatorClient,
} from "@x402/core/server";
import { registerExactEvmScheme } from "@x402/evm/exact/server";
import type {
  PaymentPayload,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
} from "@x402/core/types";

const FACILITATOR_URL = process.env.FACILITATOR_URL ?? "https://x402.org/facilitator";

// x402.org/facilitator の getSupported は localhost を 403 拒否するため、
// getSupported だけローカルで静的解決し、verify/settle は本番に委譲する。
class LocalDevFacilitatorClient implements FacilitatorClient {
  private http = new HTTPFacilitatorClient({ url: FACILITATOR_URL });

  async getSupported() {
    return {
      kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:84532" as const }],
      extensions: [],
      signers: {},
    };
  }

  verify(payload: PaymentPayload, requirements: PaymentRequirements): Promise<VerifyResponse> {
    return this.http.verify(payload, requirements);
  }

  settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse> {
    return this.http.settle(payload, requirements);
  }
}

const facilitatorClient =
  process.env.NODE_ENV === "production"
    ? new HTTPFacilitatorClient({ url: FACILITATOR_URL })
    : new LocalDevFacilitatorClient();

export const server = new x402ResourceServer(facilitatorClient);
registerExactEvmScheme(server);
