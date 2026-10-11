export const GENDER_DIVISIONS = ["boys", "girls", "coed", "men", "women", "open"] as const;
export const PLAYER_GENDERS = ["male", "female", "nonbinary", "unspecified"] as const;
export const PLAYER_STATUSES = ["active", "inactive", "archived"] as const;
export const TEAM_STATUSES = ["active", "inactive", "archived"] as const;
export const RELATIONSHIPS = ["mother", "father", "parent", "stepparent", "grandparent", "guardian", "other"] as const;

export type GenderDivision = (typeof GENDER_DIVISIONS)[number];
export type PlayerGender = (typeof PLAYER_GENDERS)[number];
export type PlayerStatus = (typeof PLAYER_STATUSES)[number];
export type Relationship = (typeof RELATIONSHIPS)[number];

export const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
