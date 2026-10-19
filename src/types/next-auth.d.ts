import type { DefaultSession } from "next-auth";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /** Primary tier: the account's home portal and default landing role. */
      role: Role;
      /** Every tier this account holds (always includes `role`). */
      roles: Role[];
      /** Tier currently selected in the dashboard role switcher. */
      activeRole: Role;
      /** False for a credential account that has not opened its link yet. */
      emailVerified: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: Role;
    roles?: Role[];
    emailVerified?: Date | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: Role;
    roles?: Role[];
    activeRole?: Role;
    emailVerified?: boolean;
  }
}
