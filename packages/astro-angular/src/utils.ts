export function addOutputListener(
  analogId: string,
  outputName: string,
  callback: (...args: unknown[]) => unknown,
  eventListenerOptions: EventListenerOptions = {},
): () => void {
  const observer = new MutationObserver((mutations) => {
    const foundTarget = mutations.find(
      (mutation) =>
        (mutation.target as HTMLElement).dataset?.['analogId'] === analogId,
    )?.target;

    if (foundTarget) {
      foundTarget.addEventListener(outputName, callback, eventListenerOptions);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { attributes: true, subtree: true });

  return (): void => observer.disconnect();
}
