"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { withRls } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db/errors";
import { books, profiles } from "@/lib/db/schema";
import { logDbError } from "@/lib/log";
import { getOwnBook } from "@/lib/queries/books";
import { isBookSlugAvailable } from "@/lib/queries/public-book";
import { bookSchema } from "@/lib/validation/book";

export type OnboardingValues = {
  display_name: string;
  slug: string;
};

export type OnboardingState = {
  step: "details" | "confirm";
  values: OnboardingValues;
  error?: string;
};

function readValues(formData: FormData): OnboardingValues {
  return {
    display_name: String(formData.get("display_name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
  };
}

export async function advanceOnboarding(
  _previous: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const claims = await requireUser();
  if (await getOwnBook(claims)) redirect("/dashboard");

  const values = readValues(formData);
  const intent = String(formData.get("intent") ?? "");

  const parsed = bookSchema.safeParse({
    ...values,
    partner_name: false,
    kids_names: false,
    birthday: false,
  });
  if (!parsed.success) {
    return {
      step: "details",
      values,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const validValues: OnboardingValues = {
    display_name: parsed.data.display_name,
    slug: parsed.data.slug,
  };
  if (intent === "back") return { step: "details", values: validValues };

  if (intent === "continue") {
    try {
      if (!(await isBookSlugAvailable(validValues.slug))) {
        return {
          step: "details",
          values: validValues,
          error: "That link name is taken",
        };
      }
    } catch (err) {
      logDbError("[ob] [advanceOnboarding] availability check failed", err);
      return {
        step: "details",
        values: validValues,
        error: "Something went wrong. Please try again.",
      };
    }
    return { step: "confirm", values: validValues };
  }

  if (intent !== "create") {
    return { step: "details", values: validValues, error: "Invalid request." };
  }

  const enabledFields = {
    partner_name: false,
    kids_names: false,
    birthday: false,
  };
  try {
    await withRls(claims, async (tx) => {
      await tx
        .update(profiles)
        .set({ displayName: validValues.display_name })
        .where(eq(profiles.id, claims.sub));
      await tx.insert(books).values({
        ownerId: claims.sub,
        slug: validValues.slug,
        enabledFields,
      });
    });
  } catch (err) {
    if (isUniqueViolation(err, "books_slug_key")) {
      return {
        step: "details",
        values: validValues,
        error: "That link name was just taken. Please choose another.",
      };
    }
    logDbError("[ob] [advanceOnboarding] create failed", err);
    return {
      step: "confirm",
      values: validValues,
      error: "Something went wrong. Please try again.",
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  redirect("/dashboard");
}
