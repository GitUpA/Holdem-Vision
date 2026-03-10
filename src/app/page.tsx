"use client";

import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useEffect } from "react";

export default function Home() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const syncUser = useMutation(api.users.syncUser);
  const currentUser = useQuery(api.users.currentUser);

  // Sync user to Convex on sign-in (wait for Convex to have the JWT)
  useEffect(() => {
    if (isAuthenticated) {
      syncUser().catch(console.error);
    }
  }, [isAuthenticated, syncUser]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-4">
      <h2 className="text-3xl font-bold">HoldemVision</h2>
      <p className="text-muted-foreground">
        See what you can&apos;t see at the table.
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {!isLoading && !isAuthenticated && (
        <p className="text-sm text-muted-foreground">
          Sign in to get started.
        </p>
      )}

      {isAuthenticated && currentUser && (
        <p className="text-sm text-muted-foreground">
          Welcome back, {currentUser.name ?? currentUser.email}.
        </p>
      )}

      {isAuthenticated && !currentUser && (
        <p className="text-sm text-muted-foreground">Loading...</p>
      )}
    </div>
  );
}
