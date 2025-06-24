import React, { useEffect, useState } from 'react';
import ContractForm from './components/ContractForm';
import FunctionExecutor from './components/FunctionExecutor';

export default function App() {
  const [contractData, setContractData] = useState(null);

  // Load from localStorage on initial load
  useEffect(() => {
    const savedData = localStorage.getItem('contractData');
    if (savedData) {
      setContractData(JSON.parse(savedData));
    }
  }, []);

  const handleLoad = (data) => {
    localStorage.setItem('contractData', JSON.stringify(data));
    setContractData(data);
  };

  return (
    <div className="container">
      <h1>Smart Contract Interactor</h1>
      <ContractForm onLoad={handleLoad} saved={contractData} />
      {contractData && <FunctionExecutor {...contractData} />}

      {contractData && (
         <button onClick={() => {
          localStorage.removeItem('contractData');
          setContractData(null);
        }} className="bg-red-600 text-white px-3 py-1 rounded">
          Clear Contract
        </button>
      )}
     
    </div>
  );
}
