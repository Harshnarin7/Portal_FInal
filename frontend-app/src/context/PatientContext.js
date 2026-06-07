import React, { createContext, useContext, useState } from "react";

const PatientContext = createContext();

export const PatientProvider = ({ children }) => {
  const [patientData, setPatientData] = useState({});

  const updatePatientData = (data) => {
    setPatientData((prev) => ({
      ...prev,
      ...data
    }));
  };

  return (
    <PatientContext.Provider value={{ patientData, updatePatientData }}>
      {children}
    </PatientContext.Provider>
  );
};

export const usePatient = () => useContext(PatientContext);