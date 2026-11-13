/**
 * Passkey-motoren. Al kryptografi ligger i biblioteket SimpleWebAuthn, som er gennemtestet og meget brugt.
 * Vi kræver altid "user verification" – dvs. Face ID, fingeraftryk eller PIN på enheden.
 */
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";

export interface GemtPasskey {
  credentialId: string;
  publicKey: Uint8Array;
  taeller: number;
  transports: string[];
}

export interface PasskeyMotor {
  tilmeldValg(bruger: { id: string; navn: string; email: string }, eksisterende: GemtPasskey[]): Promise<PublicKeyCredentialCreationOptionsJSON>;
  bekraeftTilmelding(svar: RegistrationResponseJSON, challenge: string): Promise<GemtPasskey>;
  loginValg(): Promise<PublicKeyCredentialRequestOptionsJSON>;
  /** Returnerer den nye tæller. Kaster en fejl hvis svaret ikke er gyldigt. */
  bekraeftLogin(svar: AuthenticationResponseJSON, challenge: string, passkey: GemtPasskey): Promise<number>;
}

export class PasskeyFejl extends Error {
  override name = "PasskeyFejl";
}

export function simpleWebAuthnMotor(cfg: { rpId: string; rpNavn: string; origin: string }): PasskeyMotor {
  return {
    async tilmeldValg(bruger, eksisterende) {
      return generateRegistrationOptions({
        rpName: cfg.rpNavn,
        rpID: cfg.rpId,
        userName: bruger.email,
        userDisplayName: bruger.navn,
        userID: new TextEncoder().encode(bruger.id),
        attestationType: "none",
        excludeCredentials: eksisterende.map((p) => ({ id: p.credentialId, transports: p.transports as AuthenticatorTransportFuture[] })),
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
      });
    },

    async bekraeftTilmelding(svar, challenge) {
      const res = await verifyRegistrationResponse({
        response: svar,
        expectedChallenge: challenge,
        expectedOrigin: cfg.origin,
        expectedRPID: cfg.rpId,
        requireUserVerification: true,
      });
      if (!res.verified || !res.registrationInfo) throw new PasskeyFejl("Passkey kunne ikke bekræftes");
      const c = res.registrationInfo.credential;
      return { credentialId: c.id, publicKey: c.publicKey, taeller: c.counter, transports: c.transports ?? [] };
    },

    async loginValg() {
      return generateAuthenticationOptions({ rpID: cfg.rpId, userVerification: "required", allowCredentials: [] });
    },

    async bekraeftLogin(svar, challenge, passkey) {
      const res = await verifyAuthenticationResponse({
        response: svar,
        expectedChallenge: challenge,
        expectedOrigin: cfg.origin,
        expectedRPID: cfg.rpId,
        requireUserVerification: true,
        credential: {
          id: passkey.credentialId,
          publicKey: new Uint8Array(passkey.publicKey),
          counter: passkey.taeller,
          transports: passkey.transports as AuthenticatorTransportFuture[],
        },
      });
      if (!res.verified) throw new PasskeyFejl("Login kunne ikke bekræftes");
      return res.authenticationInfo.newCounter;
    },
  };
}
