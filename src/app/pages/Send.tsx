import * as React from "react";
import PageLayout from "app/layouts/PageLayout";
import SendForm from "app/templates/SendForm";
import { ReactComponent as SendIcon } from "app/icons/send.svg";

const Send: React.FC = () => (
  <PageLayout
    pageTitle={
      <>
        <SendIcon className="mr-1 h-4 w-auto stroke-current" /> Send
      </>
    }
  >
    <div className="py-4">
      <div className="w-full max-w-sm mx-auto">
        <SendForm />
      </div>
    </div>
  </PageLayout>
);

export default Send;
