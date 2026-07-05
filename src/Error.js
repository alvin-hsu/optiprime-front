import React, {useEffect, useState} from "react";

const ErrorPage = ({ message }) => {
    return (
        <div>
            <h2>
                {message}
            </h2>
        </div>);
};

const ErrorFallback = ({ error }) => {
    const [errMsg, setErrMsg] = useState("");

    useEffect(() => {
        if (error) {
            setErrMsg(error.message);
        }
    }, [error]);

    return <div><ErrorPage message={errMsg} /></div>;
}

export default ErrorFallback;
