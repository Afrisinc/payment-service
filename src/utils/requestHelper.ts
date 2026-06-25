import axios, { AxiosInstance } from 'axios';

const requestHelper = (baseURL: string): AxiosInstance => {
  return axios.create({
    baseURL,
  });
};

export default requestHelper;
