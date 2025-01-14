import * as React from "react";
import classNames from "clsx";
import { Link } from "lib/woozie";
import { useAccount } from "lib/thanos/front";
import ErrorBoundary from "app/ErrorBoundary";
import PageLayout from "app/layouts/PageLayout";
import OperationHistory from "app/templates/OperationHistory";
import Balance from "app/templates/Balance";
import InUSD from "app/templates/InUSD";
import Money from "app/atoms/Money";
import HashChip from "app/atoms/HashChip";
import Spinner from "app/atoms/Spinner";
import SubTitle from "app/atoms/SubTitle";
import { ReactComponent as ExploreIcon } from "app/icons/explore.svg";
import { ReactComponent as QRIcon } from "app/icons/qr.svg";
import { ReactComponent as SendIcon } from "app/icons/send.svg";
import xtzImgUrl from "app/misc/xtz.png";
import EditableTitle from "./Explore/EditableTitle";
import BakingSection from "./Explore/BakingSection";

const Explore: React.FC = () => {
  const account = useAccount();
  const accountPkh = account.publicKeyHash;

  return (
    <PageLayout
      pageTitle={
        <>
          <ExploreIcon className="mr-1 h-4 w-auto stroke-current" />
          Explore
        </>
      }
    >
      <EditableTitle />

      <hr className="mb-4" />

      <div className="flex flex-col items-center">
        <HashChip hash={accountPkh} className="mb-4" />

        <img src={xtzImgUrl} alt="xtz" className="mb-2 h-16 w-auto" />

        <Balance address={accountPkh}>
          {(balance) => (
            <div className="flex flex-col items-center">
              <div className="text-gray-800 text-2xl font-light">
                <Money>{balance}</Money>{" "}
                <span className="text-lg opacity-90">XTZ</span>
              </div>

              <InUSD volume={balance}>
                {(usdBalance) => (
                  <div className="text-gray-600 text-lg font-light">
                    <span className="mr-px">$</span>
                    {usdBalance} <span className="text-sm opacity-75">USD</span>
                  </div>
                )}
              </InUSD>
            </div>
          )}
        </Balance>

        <div
          className="mt-4 w-full mx-auto flex items-stretch"
          style={{ maxWidth: "18rem" }}
        >
          <div className="w-1/2 p-2">
            <Link
              to="/receive"
              className={classNames(
                "block w-full",
                "py-2 px-4 rounded",
                "border-2",
                "border-blue-500 hover:border-blue-600 focus:border-blue-600",
                "flex items-center justify-center",
                "text-blue-500 hover:text-blue-600 focus:text-blue-600",
                "shadow-sm hover:shadow focus:shadow",
                "text-base font-semibold",
                "transition ease-in-out duration-300"
              )}
              type="button"
            >
              <QRIcon
                className={classNames(
                  "-ml-2 mr-2",
                  "h-5 w-auto",
                  "stroke-current"
                )}
              />
              Receive
            </Link>
          </div>

          <div className="w-1/2 p-2">
            <Link
              to="/send"
              className={classNames(
                "w-full",
                "py-2 px-4 rounded",
                "border-2",
                "border-blue-500 hover:border-blue-600 focus:border-blue-600",
                "bg-blue-500 hover:bg-blue-600",
                "shadow-sm hover:shadow focus:shadow",
                "flex items-center justify-center",
                "text-white",
                "text-base font-semibold",
                "transition ease-in-out duration-300"
              )}
              type="button"
            >
              <SendIcon
                className={classNames(
                  "-ml-3 -mt-1 mr-1",
                  "h-5 w-auto",
                  "transform -rotate-45",
                  "stroke-current"
                )}
              />
              Send
            </Link>
          </div>
        </div>
      </div>

      <SubTitle>Baking</SubTitle>

      <SuspenseContainer whileMessage="fetching or processing your delegation info">
        <BakingSection />
      </SuspenseContainer>

      <SubTitle>Operations</SubTitle>

      <SuspenseContainer whileMessage="fetching or processing operation history from TZStats">
        <OperationHistory accountPkh={accountPkh} />
      </SuspenseContainer>
    </PageLayout>
  );
};

export default Explore;

const SuspenseContainer: React.FC<{ whileMessage: string }> = ({
  whileMessage,
  children,
}) => (
  <ErrorBoundary whileMessage={whileMessage}>
    <React.Suspense fallback={<SpinnerSection />}>{children}</React.Suspense>
  </ErrorBoundary>
);

const SpinnerSection: React.FC = () => (
  <div className="my-12 flex justify-center">
    <Spinner theme="gray" className="w-20" />
  </div>
);
