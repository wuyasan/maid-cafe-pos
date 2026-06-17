function getApiBase() {
  const configured =
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  if (configured) {
    return configured.replace(/\/$/, "");
  }

  if (typeof window === "undefined") {
    return "http://127.0.0.1:8000/api/v1";
  }

  return (
    `${window.location.protocol}//` +
    `${window.location.hostname}:8000/api/v1`
  );
}

async function handleResponse<T>(
  response: Response,
): Promise<T> {
  if (!response.ok) {
    let message = "Request failed";

    try {
      const data = await response.json();
      message =
        data.detail || JSON.stringify(data);
    } catch {
      message = await response.text();
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function apiGet<T>(
  path: string,
): Promise<T> {
  return handleResponse<T>(
    await fetch(`${getApiBase()}${path}`, {
      cache: "no-store",
    }),
  );
}

export async function apiPost<T>(
  path: string,
  body: unknown,
): Promise<T> {
  return handleResponse<T>(
    await fetch(`${getApiBase()}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
}
