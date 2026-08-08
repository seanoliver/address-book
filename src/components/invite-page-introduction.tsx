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
      <Heading className="font-serif text-2xl leading-tight text-balance text-foreground">
        Add your address to {ownerName}&apos;s address book
      </Heading>
      <p className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground">
        Fill in your details below. Only {ownerName} can see what you submit.
      </p>
    </>
  );
}
