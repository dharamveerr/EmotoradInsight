import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export interface CurrentUser {
  id: string;
  username: string;
  role: string;
  name: string;
  email: string | null;
  picture: string | null;
  phone_number: string | null;
  is_active: number;
}

export function useCurrentUser(): CurrentUser | undefined {
  const { data } = useSWR<CurrentUser>("/api/me", fetcher, {
    revalidateOnFocus: false,
  });
  return data;
}
