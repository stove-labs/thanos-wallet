import * as React from "react";
import classNames from "clsx";
import { useForm, Controller } from "react-hook-form";
import useSWR from "swr";
import BigNumber from "bignumber.js";
import { DEFAULT_FEE } from "@taquito/taquito";
import {
  ThanosAccountType,
  useAllAccounts,
  useAccount,
  useTezos,
  useBalance,
  usePendingOperations,
  fetchBalance,
  tzToMutez,
  mutezToTz,
  isAddressValid,
  hasManager,
} from "lib/thanos/front";
import useSafeState from "lib/ui/useSafeState";
import {
  ArtificialError,
  NotEnoughFundsError,
  ZeroBalanceError,
} from "app/defaults";
import { useAppEnv } from "app/env";
import Balance from "app/templates/Balance";
import InUSD from "app/templates/InUSD";
import OperationStatus from "app/templates/OperationStatus";
import Spinner from "app/atoms/Spinner";
import Money from "app/atoms/Money";
import NoSpaceField from "app/atoms/NoSpaceField";
import AssetField from "app/atoms/AssetField";
import FormSubmitButton from "app/atoms/FormSubmitButton";
import Identicon from "app/atoms/Identicon";
import Name from "app/atoms/Name";
import Alert from "app/atoms/Alert";
import xtzImgUrl from "app/misc/xtz.png";

interface FormData {
  to: string;
  amount: number;
  fee: number;
}

const PENNY = 0.000001;
const RECOMMENDED_ADD_FEE = 0.0001;

const SendForm: React.FC = () => {
  const { registerBackHandler } = useAppEnv();

  const allAccounts = useAllAccounts();
  const acc = useAccount();
  const tezos = useTezos();

  const accountPkh = acc.publicKeyHash;
  const assetSymbol = "XTZ";

  const { data: balanceData, mutate: mutateBalance } = useBalance(accountPkh);
  const balance = balanceData!;
  const balanceNum = balance!.toNumber();

  const { addPndOps } = usePendingOperations();

  /**
   * Form
   */

  const {
    watch,
    handleSubmit,
    errors,
    control,
    formState,
    setValue,
    triggerValidation,
    reset,
  } = useForm<FormData>({
    mode: "onChange",
    defaultValues: {
      fee: RECOMMENDED_ADD_FEE,
    },
  });

  const toValue = watch("to");
  const amountValue = watch("amount");
  const feeValue = watch("fee") ?? RECOMMENDED_ADD_FEE;

  const toFieldRef = React.useRef<HTMLTextAreaElement>(null);
  const amountFieldRef = React.useRef<HTMLInputElement>(null);
  const feeFieldRef = React.useRef<HTMLInputElement>(null);

  const toFilled = React.useMemo(
    () => Boolean(toValue && isAddressValid(toValue)),
    [toValue]
  );

  const filledAccount = React.useMemo(
    () =>
      (toFilled && allAccounts.find((a) => a.publicKeyHash === toValue)) ||
      null,
    [toFilled, allAccounts, toValue]
  );

  const cleanToField = React.useCallback(() => {
    setValue("to", "");
  }, [setValue]);

  React.useLayoutEffect(() => {
    if (toFilled) {
      return registerBackHandler(() => {
        cleanToField();
        window.scrollTo(0, 0);
      });
    }
  }, [toFilled, registerBackHandler, cleanToField]);

  const estimateBaseFee = React.useCallback(async () => {
    try {
      const balanceBN = (await mutateBalance(fetchBalance(accountPkh, tezos)))!;
      if (balanceBN.isZero()) {
        throw new ZeroBalanceError();
      }

      const to = toValue;
      const estmtn = await tezos.estimate.transfer({ to, amount: PENNY });
      let amountMax = balanceBN.minus(mutezToTz(estmtn.totalCost));
      const manager = await tezos.rpc.getManagerKey(accountPkh);
      if (!hasManager(manager)) {
        amountMax = amountMax.minus(mutezToTz(DEFAULT_FEE.REVEAL));
      }
      const estmtnMax = await tezos.estimate.transfer({
        to,
        amount: amountMax.toNumber(),
      });

      let baseFee = mutezToTz(estmtnMax.totalCost);
      if (!hasManager(manager)) {
        baseFee = baseFee.plus(mutezToTz(DEFAULT_FEE.REVEAL));
      }

      if (baseFee.isGreaterThanOrEqualTo(balanceBN)) {
        throw new NotEnoughFundsError();
      }

      return baseFee;
    } catch (err) {
      // Human delay
      await new Promise((r) => setTimeout(r, 300));

      if (err instanceof ArtificialError) {
        return err;
      }

      if (process.env.NODE_ENV === "development") {
        console.error(err);
      }

      switch (true) {
        //  case ["delegate.unchanged", "delegate.already_active"].some((t) =>
        //    err?.id.includes(t)
        //  ):
        //    return new UnchangedError(err.message);

        //  case err?.id.includes("unregistered_delegate"):
        //    return new UnregisteredDelegateError(err.message);

        default:
          throw err;
      }
    }
  }, [tezos, accountPkh, toValue, mutateBalance]);

  const {
    data: baseFee,
    error: estimateBaseFeeError,
    isValidating: estimating,
  } = useSWR(
    () =>
      toFilled
        ? ["transfer-base-fee", tezos.checksum, accountPkh, toValue]
        : null,
    estimateBaseFee,
    {
      shouldRetryOnError: false,
      focusThrottleInterval: 10_000,
      dedupingInterval: 30_000,
    }
  );
  const estimationError = !estimating
    ? baseFee instanceof Error
      ? baseFee
      : estimateBaseFeeError
    : null;

  const maxAddFee = React.useMemo(() => {
    if (baseFee instanceof BigNumber) {
      return new BigNumber(balanceNum).minus(baseFee).minus(PENNY).toNumber();
    }
  }, [balanceNum, baseFee]);

  const safeFeeValue = React.useMemo(
    () => (maxAddFee && feeValue > maxAddFee ? maxAddFee : feeValue),
    [maxAddFee, feeValue]
  );

  const maxAmount = React.useMemo(() => {
    if (!(baseFee instanceof BigNumber)) return null;
    const ma = new BigNumber(balanceNum)
      .minus(baseFee)
      .minus(safeFeeValue ?? 0);
    return BigNumber.max(ma, 0);
  }, [balanceNum, baseFee, safeFeeValue]);

  const maxAmountNum = React.useMemo(
    () => (maxAmount instanceof BigNumber ? maxAmount.toNumber() : maxAmount),
    [maxAmount]
  );

  const validateAmount = React.useCallback(
    (v: number) => {
      if (!v) return "Required";
      if (!maxAmountNum) return true;
      const vBN = new BigNumber(v);
      return (
        vBN.isLessThanOrEqualTo(maxAmountNum) ||
        `Maximal: ${maxAmountNum.toString()}`
      );
    },
    [maxAmountNum]
  );

  const handleFeeFieldChange = React.useCallback(
    ([v]) => (maxAddFee && v > maxAddFee ? maxAddFee : v),
    [maxAddFee]
  );

  React.useEffect(() => {
    if (formState.dirtyFields.has("amount")) {
      triggerValidation("amount");
    }
  }, [formState.dirtyFields, triggerValidation, maxAmountNum]);

  const handleSetMaxAmount = React.useCallback(() => {
    if (maxAmount) {
      setValue("amount", maxAmount.toNumber());
      triggerValidation("amount");
    }
  }, [setValue, maxAmount, triggerValidation]);

  const handleSetRecommendedFee = React.useCallback(() => {
    setValue("fee", RECOMMENDED_ADD_FEE);
  }, [setValue]);

  const [submitError, setSubmitError] = useSafeState<React.ReactNode>(
    null,
    `${tezos.checksum}_${toValue}`
  );
  const [operation, setOperation] = useSafeState<any>(null, tezos.checksum);

  const onSubmit = React.useCallback(
    async ({ to, amount, fee: feeVal }: FormData) => {
      if (formState.isSubmitting) return;
      setSubmitError(null);
      setOperation(null);

      try {
        const estmtn = await tezos.estimate.transfer({ to, amount });
        const addFee = tzToMutez(feeVal ?? 0);
        const fee = addFee.plus(estmtn.usingBaseFeeMutez).toNumber();
        let op;
        try {
          op = await tezos.contract.transfer({ to, amount, fee });
        } catch (err) {
          if (
            err?.errors?.some((e: any) =>
              e?.id.includes("empty_implicit_delegated_contract")
            )
          ) {
            op = await tezos.contract.transfer({
              to,
              amount,
              fee: new BigNumber(fee).minus(tzToMutez(PENNY)).toNumber(),
            });
          } else {
            throw err;
          }
        }

        setOperation(op);

        const { hash, results } = op;
        const pndOps = Array.from(results)
          .reverse()
          .map((o) => ({
            hash,
            kind: o.kind,
            amount:
              (o as any).amount && mutezToTz(+(o as any).amount).toNumber(),
            destination: (o as any).destination,
            addedAt: new Date().toString(),
          }));
        addPndOps(pndOps);

        reset({ to: "", fee: RECOMMENDED_ADD_FEE });
      } catch (err) {
        if (err.message === "Declined") {
          return;
        }

        if (process.env.NODE_ENV === "development") {
          console.error(err);
        }

        // Human delay.
        await new Promise((res) => setTimeout(res, 300));
        setSubmitError(err);
      }
    },
    [
      formState.isSubmitting,
      tezos,
      setSubmitError,
      setOperation,
      addPndOps,
      reset,
    ]
  );

  const restFormDisplayed = Boolean(toFilled && (baseFee || estimationError));
  const estimateFallbackDisplayed = toFilled && !baseFee && estimating;

  return (
    <>
      {operation && (
        <OperationStatus typeTitle="Transaction" operation={operation} />
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        {React.useMemo(
          () => (
            <div
              className={classNames(
                "mb-6",
                "border rounded-md",
                "p-2",
                "flex items-center"
              )}
            >
              <img
                src={xtzImgUrl}
                alt={assetSymbol}
                className="h-12 w-auto mr-3"
              />

              <div className="font-light leading-none">
                <div className="flex items-center">
                  <div className="flex flex-col">
                    <span className="text-xl text-gray-700">
                      <Money>{balance}</Money>{" "}
                      <span style={{ fontSize: "0.75em" }}>{assetSymbol}</span>
                    </span>

                    <InUSD volume={balance}>
                      {(usdBalance) => (
                        <div className="mt-1 text-sm text-gray-500">
                          ${usdBalance}
                        </div>
                      )}
                    </InUSD>
                  </div>
                </div>
              </div>
            </div>
          ),
          [assetSymbol, balance]
        )}

        <Controller
          name="to"
          as={<NoSpaceField ref={toFieldRef} />}
          control={control}
          rules={{
            required: "Required",
            validate: validateAddressForm,
          }}
          onChange={([v]) => v}
          onFocus={() => toFieldRef.current?.focus()}
          textarea
          rows={2}
          cleanable={Boolean(toValue)}
          onClean={cleanToField}
          id="send-to"
          label="Recipient"
          labelDescription={
            filledAccount ? (
              <div className="flex flex-wrap items-center">
                <Identicon
                  type="bottts"
                  hash={filledAccount.publicKeyHash}
                  size={14}
                  className="flex-shrink-0 opacity-75 shadow-xs"
                />
                <div className="ml-1 mr-px font-normal">
                  {filledAccount.name}
                </div>{" "}
                (
                <Balance address={filledAccount.publicKeyHash}>
                  {(bal) => (
                    <span className={classNames("text-xs leading-none")}>
                      <Money>{bal}</Money>{" "}
                      <span style={{ fontSize: "0.75em" }}>{assetSymbol}</span>
                    </span>
                  )}
                </Balance>
                )
              </div>
            ) : (
              `Address to send ${assetSymbol} funds to.`
            )
          }
          placeholder="e.g. tz1a9w1S7hN5s..."
          errorCaption={errors.to?.message}
          style={{
            resize: "none",
          }}
          containerClassName="mb-4"
        />

        {estimateFallbackDisplayed ? (
          <div className="my-8 flex justify-center">
            <Spinner className="w-20" />
          </div>
        ) : restFormDisplayed ? (
          <>
            {(submitError || estimationError) && (
              <SendErrorAlert
                type={submitError ? "submit" : "estimation"}
                error={submitError || estimationError}
              />
            )}

            <Controller
              name="amount"
              as={<AssetField ref={amountFieldRef} />}
              control={control}
              rules={{
                validate: validateAmount,
              }}
              onChange={([v]) => v}
              onFocus={() => amountFieldRef.current?.focus()}
              id="send-amount"
              assetSymbol={assetSymbol}
              label="Amount"
              labelDescription={
                maxAmount && (
                  <>
                    Available to send(max):{" "}
                    <button
                      type="button"
                      className={classNames("underline")}
                      onClick={handleSetMaxAmount}
                    >
                      {maxAmount.toString()}
                    </button>
                    {amountValue ? (
                      <>
                        <br />
                        <InUSD volume={amountValue}>
                          {(usdAmount) => (
                            <div className="mt-1 -mb-3">
                              ≈{" "}
                              <span className="font-normal text-gray-700">
                                <span className="pr-px">$</span>
                                {usdAmount}
                              </span>{" "}
                              in USD
                            </div>
                          )}
                        </InUSD>
                      </>
                    ) : null}
                  </>
                )
              }
              placeholder="e.g. 123.45"
              errorCaption={errors.amount?.message}
              containerClassName="mb-4"
              autoFocus={Boolean(maxAmount)}
            />

            <Controller
              name="fee"
              as={<AssetField ref={feeFieldRef} />}
              control={control}
              onChange={handleFeeFieldChange}
              onFocus={() => feeFieldRef.current?.focus()}
              id="send-fee"
              assetSymbol={assetSymbol}
              label="Additional Fee"
              labelDescription={
                baseFee instanceof BigNumber && (
                  <>
                    Base Fee for this transaction is:{" "}
                    <span className="font-normal">{baseFee.toString()}</span>
                    <br />
                    Additional - speeds up its confirmation,
                    <br />
                    recommended:{" "}
                    <button
                      type="button"
                      className={classNames("underline")}
                      onClick={handleSetRecommendedFee}
                    >
                      {RECOMMENDED_ADD_FEE}
                    </button>
                  </>
                )
              }
              placeholder="0"
              errorCaption={errors.fee?.message}
              containerClassName="mb-4"
            />

            <FormSubmitButton
              loading={formState.isSubmitting}
              disabled={formState.isSubmitting || Boolean(estimationError)}
            >
              Send
            </FormSubmitButton>
          </>
        ) : (
          allAccounts.length > 1 && (
            <div className={classNames("my-6", "flex flex-col")}>
              <h2
                className={classNames("mb-4", "leading-tight", "flex flex-col")}
              >
                <span className="text-base font-semibold text-gray-700">
                  Send to My Accounts
                </span>

                <span
                  className={classNames(
                    "mt-1",
                    "text-xs font-light text-gray-600"
                  )}
                  style={{ maxWidth: "90%" }}
                >
                  Click on Account you want to send funds to.
                </span>
              </h2>

              <div
                className={classNames(
                  "rounded-md overflow-hidden",
                  "border-2 bg-gray-100",
                  "flex flex-col",
                  "text-gray-700 text-sm leading-tight"
                )}
              >
                {allAccounts
                  .filter((acc) => acc.publicKeyHash !== accountPkh)
                  .map((acc, i, arr) => {
                    const last = i === arr.length - 1;
                    const handleAccountClick = () => {
                      setValue("to", acc.publicKeyHash);
                      triggerValidation("to");
                    };

                    return (
                      <button
                        key={acc.publicKeyHash}
                        type="button"
                        className={classNames(
                          "block w-full",
                          "overflow-hidden",
                          !last && "border-b border-gray-200",
                          "hover:bg-gray-200 focus:bg-gray-200",
                          "flex items-center",
                          "text-gray-700",
                          "transition ease-in-out duration-200",
                          "focus:outline-none",
                          "opacity-90 hover:opacity-100"
                        )}
                        style={{
                          padding: "0.4rem 0.375rem 0.4rem 0.375rem",
                        }}
                        onClick={handleAccountClick}
                      >
                        <Identicon
                          type="bottts"
                          hash={acc.publicKeyHash}
                          size={32}
                          className="flex-shrink-0 shadow-xs"
                        />

                        <div className="ml-2 flex flex-col items-start">
                          <div className="flex flex-wrap items-center">
                            <Name className="text-sm font-medium leading-tight">
                              {acc.name}
                            </Name>

                            {acc.type === ThanosAccountType.Imported && (
                              <span
                                className={classNames(
                                  "ml-2",
                                  "rounded-sm",
                                  "border border-black-25",
                                  "px-1 py-px",
                                  "leading-tight",
                                  "text-black-50"
                                )}
                                style={{ fontSize: "0.6rem" }}
                              >
                                Imported
                              </span>
                            )}
                          </div>

                          <div className="mt-1 flex flex-wrap items-center">
                            <div
                              className={classNames(
                                "text-xs leading-none",
                                "text-gray-700"
                              )}
                            >
                              {(() => {
                                const val = acc.publicKeyHash;
                                const ln = val.length;
                                return (
                                  <>
                                    {val.slice(0, 7)}
                                    <span className="opacity-75">...</span>
                                    {val.slice(ln - 4, ln)}
                                  </>
                                );
                              })()}
                            </div>

                            <Balance address={acc.publicKeyHash}>
                              {(bal) => (
                                <div
                                  className={classNames(
                                    "ml-2",
                                    "text-xs leading-none",
                                    "text-gray-600"
                                  )}
                                >
                                  <Money>{bal}</Money>{" "}
                                  <span style={{ fontSize: "0.75em" }}>
                                    {assetSymbol}
                                  </span>
                                </div>
                              )}
                            </Balance>
                          </div>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          )
        )}
      </form>
    </>
  );
};

export default SendForm;

type SendErrorAlertProps = {
  type: "submit" | "estimation";
  error: Error;
};

const SendErrorAlert: React.FC<SendErrorAlertProps> = ({ type, error }) => (
  <Alert
    type={type === "submit" ? "error" : "warn"}
    title={(() => {
      switch (true) {
        case error instanceof NotEnoughFundsError:
          return "Not enough funds 😶";

        default:
          return "Failed";
      }
    })()}
    description={(() => {
      switch (true) {
        case error instanceof ZeroBalanceError:
          return <>Your Balance is zero.</>;

        case error instanceof NotEnoughFundsError:
          return (
            <>
              Minimal fee for this transaction is greater than your balance. A
              large fee may be due because you sending funds to an empty Manager
              account. That requires a one-time 0.257 XTZ burn fee;
            </>
          );

        default:
          return (
            <>
              Unable to {type === "submit" ? "send" : "estimate"} transaction to
              provided Recipient.
              <br />
              This may happen because:
              <ul className="mt-1 ml-2 list-disc list-inside text-xs">
                <li>
                  Minimal fee for this transaction is greater than your balance.
                  A large fee may be due because you sending funds to an empty
                  Manager account. That requires a one-time 0.257 XTZ burn fee;
                </li>
                <li>Network or other tech issue.</li>
              </ul>
            </>
          );
      }
    })()}
    autoFocus
    className={classNames("mt-6 mb-4")}
  />
);

function validateAddressForm(value: any) {
  return isAddressValid(value) || "Invalid address";
}
