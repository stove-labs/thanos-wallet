import * as React from "react";
import classNames from "clsx";
import { useForm } from "react-hook-form";
import { Link } from "lib/woozie";
import { useThanosClient } from "lib/thanos/front";
import SimplePageLayout from "app/layouts/SimplePageLayout";
import FormField from "app/atoms/FormField";
import FormSubmitButton from "app/atoms/FormSubmitButton";

interface UnlockProps {
  canImportNew?: boolean;
}

type FormData = {
  password: string;
};

const SUBMIT_ERROR_TYPE = "submit-error";

const Unlock: React.FC<UnlockProps> = ({ canImportNew = true }) => {
  const { unlock } = useThanosClient();

  const formRef = React.useRef<HTMLFormElement>(null);

  const focusPasswordField = React.useCallback(() => {
    formRef.current
      ?.querySelector<HTMLInputElement>("input[name='password']")
      ?.focus();
  }, []);

  const {
    register,
    handleSubmit,
    errors,
    setError,
    clearError,
    formState,
  } = useForm<FormData>();
  const submitting = formState.isSubmitting;

  const onSubmit = React.useCallback(
    async ({ password }) => {
      if (submitting) return;

      clearError("password");
      try {
        await unlock(password);
      } catch (err) {
        if (process.env.NODE_ENV === "development") {
          console.error(err);
        }

        // Human delay.
        await new Promise((res) => setTimeout(res, 300));
        setError("password", SUBMIT_ERROR_TYPE, err.message);
        focusPasswordField();
      }
    },
    [submitting, clearError, setError, unlock, focusPasswordField]
  );

  return (
    <SimplePageLayout
      title={
        <>
          Unlock the Wallet
          <br />
          <span style={{ fontSize: "0.9em" }}>to continue</span>
        </>
      }
    >
      <form
        ref={formRef}
        className="my-8 w-full mx-auto max-w-sm"
        onSubmit={handleSubmit(onSubmit)}
      >
        <FormField
          ref={register({ required: "Required" })}
          label="Password"
          labelDescription="A password is used to protect the wallet."
          id="unlock-password"
          type="password"
          name="password"
          placeholder="********"
          errorCaption={errors.password && errors.password.message}
          containerClassName="mb-4"
          autoFocus
        />

        <FormSubmitButton loading={submitting} disabled={submitting}>
          Unlock
        </FormSubmitButton>

        {canImportNew && (
          <div className="my-6">
            <h3 className="text-gray-600 text-sm font-light">
              Restore Account? Want to sign in another?
            </h3>

            <Link
              to="/import-wallet"
              className={classNames(
                "text-primary-orange",
                "text-sm font-semibold",
                "transition duration-200 ease-in-out",
                "opacity-75 hover:opacity-100 focus:opacity-100",
                "hover:underline"
              )}
            >
              Import Wallet using Seed Phrase
            </Link>
          </div>
        )}
      </form>
    </SimplePageLayout>
  );
};

export default Unlock;
