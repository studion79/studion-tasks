function capitalizeChunk(input: string): string {
  if (!input) return "";
  return input.charAt(0).toUpperCase() + input.slice(1).toLowerCase();
}

function capitalizeWord(word: string): string {
  return word
    .split("-")
    .map((part) => part.split("'").map(capitalizeChunk).join("'"))
    .join("-");
}

export function formatFirstName(rawFirstName: string): string {
  const normalized = rawFirstName.trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  return normalized
    .split(" ")
    .map(capitalizeWord)
    .join(" ");
}

export function formatLastName(rawLastName: string): string {
  const normalized = rawLastName.trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  return normalized.toLocaleUpperCase();
}

export function formatUserNameParts(rawFirstName: string, rawLastName: string): string {
  const firstName = formatFirstName(rawFirstName);
  const lastName = formatLastName(rawLastName);
  if (!firstName && !lastName) return "";
  if (!lastName) return firstName;
  if (!firstName) return lastName;
  return `${firstName} ${lastName}`;
}

export function splitUserDisplayName(rawName: string): { firstName: string; lastName: string } {
  const normalized = rawName.trim().replace(/\s+/g, " ");
  if (!normalized) return { firstName: "", lastName: "" };
  const parts = normalized.split(" ");
  if (parts.length === 1) {
    return { firstName: formatFirstName(parts[0]), lastName: "" };
  }
  return {
    firstName: formatFirstName(parts[0]),
    lastName: formatLastName(parts.slice(1).join(" ")),
  };
}

export function formatUserDisplayName(rawName: string): string {
  const normalized = rawName.trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  const parts = normalized.split(" ");
  if (parts.length === 1) return capitalizeWord(parts[0]);
  const firstName = capitalizeWord(parts[0]);
  const lastName = parts
    .slice(1)
    .join(" ")
    .toLocaleUpperCase();
  return `${firstName} ${lastName}`;
}
