If TestBed is not reset between tests, the following error would be thrown on second test of the second test file:

> Error: Cannot configure the test module when the test module has already been instantiated.
> Make sure you are not using `inject` before `TestBed.configureTestingModule`.

That is why we have two test files:

- `reset-test-bed-between-tests-1.spec.ts`
- `reset-test-bed-between-tests-2.spec.ts`
