import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { authApi } from "../api/auth";
import { ApiError, getToken } from "../api/client";

export function useAuth() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => authApi.me(),
    retry: (_, err) => !(err instanceof ApiError && err.status === 401),
    staleTime: 5 * 60_000,       // treat as fresh for 5 minutes
    gcTime: 10 * 60_000,         // keep in cache for 10 minutes
    enabled: !!getToken(),        // don't even try if no token stored
  });

  const logout = useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => {
      qc.clear();
      navigate("/", { replace: true });
    },
  });

  return {
    user: data?.user ?? null,
    isLoading: isLoading && !!getToken(), // only "loading" if we actually have a token to check
    isLoggedIn: !!data?.user,
    logout: logout.mutate,
    logoutAsync: logout.mutateAsync,
  };
}
