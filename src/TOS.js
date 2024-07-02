import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Cookies from "js-cookie";

const TOS = () => {
    const navigate = useNavigate();
    const [isChecked, setIsChecked] = useState(false);

    const handleCheckboxChange = (event) => {
        setIsChecked(event.target.checked);
    };

    const acceptTOS = (_) => {
        const token = Cookies.get("jwt");
        const url = "https://api.optipri.me/accept_tos";
       (fetch(url, { headers: { "Authorization": token },
                     method: "POST" })
        .then((resp) => {
            console.log(resp);
            Cookies.set('tos', resp.body, { secure: true, sameSite: 'Strict' });
            navigate("/");
        }));
    };

    return (
        <div>
            <h1>Terms of Service</h1>
            <p>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure
                dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non
                proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
            </p>
            <label>
                <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={handleCheckboxChange}
                />
                I agree to the Terms of Service
            </label>
            <br />
            <button
                disabled={!isChecked}
                onClick={acceptTOS}
            >
                Accept TOS
            </button>
        </div>
    );
};

export default TOS;
