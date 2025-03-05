import React, {useEffect, useState} from "react";

const ErrorPage = ({ message }) => {
    return (
        <div>
            <h2>
                {message}
            </h2>
        </div>);
};  // DC TODO: Add content here

const ErrorBoundary = ({ children }) => {
    const [hasError, setHasError] = useState(false);
    const [errMsg, setErrMsg] = useState("");

    useEffect(() => {
        const handler = (e) => {
            console.log(e);
            setHasError(true);
            setErrMsg(e.message);
        };

        window.addEventListener("error", handler);
        window.addEventListener("unhandledrejection", handler);

        return () => {
            window.removeEventListener("error", handler);
            window.removeEventListener("unhandledrejection", handler);
        }
    }, []);

    if (hasError) {
        return <ErrorPage message={errMsg}></ErrorPage>
    }

    return children;
}

export default ErrorBoundary;
