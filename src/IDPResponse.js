import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Cookies from 'js-cookie';

/*
 * Handles google OAuth2 response - stores the access token in a cookie and redirects to page in 'state' parameter
 * 
 * AWS was configured to redirect users to this page after successful login:
 * https://optipri.me/idpresponse#access_token=XXX&id_token=XXX&token_type=Bearer&expires_in=XXX
 * 
 * Future requests can be authenticated by setting the 'X-Optiprime-Auth' header. 
 * 
 * Configurable at: 
 * OptiPrimeAPI -> Authorizers -> Optiprime-authorizer -> Token Source
 * 
 */

const IDPResponse = () => {
  const navigate = useNavigate();

  useEffect(() => {
    console.log(window.location);
    const hash = window.location.hash.substring(1);
    console.log(hash);
    const params = new URLSearchParams(hash);
    console.log(params);
    const accessToken = params.get('access_token');
    const redirectUrl = params.get('state');

    if (accessToken) {
      Cookies.set('jwt', accessToken, { secure: true, sameSite: 'Strict' });
      console.log('Got id_token: ', accessToken);
      if (redirectUrl) {
        navigate(redirectUrl);
      } else {
        navigate('/');
      }
    } else {
      console.error('access_token not found in the URL');
    }
  }, [navigate]);

  return <div>Loading...</div>;
};

export default IDPResponse;
