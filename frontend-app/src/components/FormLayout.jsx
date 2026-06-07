import Sidebar from "../Sidebar";
import "../layouts/FormLayout.css";

export default function FormLayout({ children }) {
  return (
    <>
      <Sidebar />

      <div className="form-layout-container">
        {children}
      </div>
    </>
  );
}