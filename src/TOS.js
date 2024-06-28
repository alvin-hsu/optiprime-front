import React, { useState } from 'react';

const TOS = () => {
  const [isChecked, setIsChecked] = useState(false);

  const handleCheckboxChange = (event) => {
    setIsChecked(event.target.checked);
  };

  const initiateLogin = () => {
    const clientId = '55kpv1cuiekc2drftj2ftr71nu';
    const redirectUri = encodeURIComponent('https://optipri.me/idpresponse');
    const loginUrl = `https://optiprime.auth.us-east-2.amazoncognito.com/oauth2/authorize?response_type=token&client_id=${clientId}&redirect_uri=${redirectUri}`;

    window.location.href = loginUrl;
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
        onClick={initiateLogin} 
        disabled={!isChecked}
      >
        Login with Google
      </button>
    </div>
  );
};

export default TOS;
