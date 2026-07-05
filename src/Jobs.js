import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Table,
  TableCell,
  TableBody,
  TableHead,
  TableRow,
} from "@aws-amplify/ui-react";

import { fetchAuth } from "./Utils";

const Jobs = () => {
    const [jobs, setJobs] = useState([]);
    const navigate = useNavigate();

    useEffect(() => {
        fetchAuth("ac_token", "https://api.optipri.me/jobs")
        .then(resp => resp.json())
        .then(result => {
            if (result["Count"] > 0) {
                const items = result["Items"];
                setJobs(items
                        .toSorted((a, b) => (a.submitTime.S < b.submitTime.S ? 1 : -1))
                        .map(x => ({ id: x.jobID.S,
                                     name: x.name.S,
                                     status: x.status.S,
                                     submitTime: x.submitTime.S }))
                );
            }
        })
    }, []);

    return (
        <div>
            <Table
                highlightOnHover={true}
                style={{ tableLayout: "fixed" }}
            >
                <TableHead borderWidth="1px" borderColor="black" height="10px">
                    <TableRow height="10px" padding="5px">
                        <TableCell as="th" style={{ width: "200px" }}>Job ID</TableCell>
                        <TableCell as="th">Job name</TableCell>
                        <TableCell as="th" style={{ width: "100px" }}>Status</TableCell>
                        <TableCell as="th" style={{ width: "600px" }}>Submitted at</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                {jobs.map(j =>
                    <TableRow height="20px" onClick={() => navigate(`${j.id}`)}>
                        <TableCell>{j.id}</TableCell>
                        <TableCell>{j.name}</TableCell>
                        <TableCell>{j.status}</TableCell>
                        <TableCell>{new Date(j.submitTime).toString()}</TableCell>
                    </TableRow>
                )}
                </TableBody>
            </Table>
        </div>
    );
};

export default Jobs;
