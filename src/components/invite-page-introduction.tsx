type InvitePageIntroductionProps = {
  ownerName: string;
  /** Preview is nested beneath the onboarding page's h1. */
  headingLevel?: "h1" | "h3";
};

/** Recipient-facing heading and privacy copy, shared with the live preview. */
export function InvitePageIntroduction({
  ownerName,
  headingLevel = "h1",
}: InvitePageIntroductionProps) {
  const Heading = headingLevel;
  return (
    <>
      <Heading className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Add your address to {ownerName}&apos;s address book
      </Heading>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Fill in your details below. Only {ownerName} can see what you submit.
      </p>
    </>
  );
}
